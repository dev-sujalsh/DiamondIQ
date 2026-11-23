"""
DiamondAgent — trains on the dataset and produces everything the dashboard shows.

Training (all local, no API key needed):
  * TF-IDF text model over question+answer
  * KMeans topic clusters (k picked by silhouette score)
  * Logistic-regression classifiers for category and difficulty
  * Retrieval index used by the chat

Optional: if ANTHROPIC_API_KEY is set, Claude writes the executive summary and
turns retrieved dataset entries into natural chat answers. Without a key the
agent falls back to deterministic, fully local output.
"""
import hashlib
import json
import os
import re
from collections import Counter

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import Normalizer
from sklearn.model_selection import StratifiedKFold, cross_val_predict

CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")
EXTRA_STOP = {"diamond", "diamonds", "called", "known", "use", "used", "typically", "usually", "does", "mean", "means",
              "make", "made", "often", "common", "commonly", "ways", "way", "like", "also", "refers", "term"}
STOP = list(ENGLISH_STOP_WORDS | EXTRA_STOP)


def _words(text):
    return re.findall(r"[A-Za-z0-9']+", text or "")


class DiamondAgent:
    def __init__(self, questions):
        self.questions = [self._clean(q, i) for i, q in enumerate(questions)]
        self.texts = [f"{q['question']} {q['answer']}" for q in self.questions]
        self.fingerprint = hashlib.md5(json.dumps(self.texts).encode()).hexdigest()
        self.trained = False

    @staticmethod
    def _clean(q, i):
        return {
            "id": q.get("id", f"u{i}"),
            "category": q.get("category", "Unknown"),
            "difficulty": q.get("difficulty", "Unknown"),
            "question": (q.get("question") or "").strip(),
            "answer": (q.get("answer") or "").strip(),
        }

    # ───────────────────────────── training ─────────────────────────────
    def train(self):
        n = len(self.texts)
        if n < 8:
            raise ValueError("Need at least 8 questions to train the agent.")

        self.vec = TfidfVectorizer(stop_words=STOP, ngram_range=(1, 2), min_df=1,
                                   sublinear_tf=True, max_features=5000)
        self.X = self.vec.fit_transform(self.texts)
        self.terms = np.array(self.vec.get_feature_names_out())

        # Retrieval index: questions weighted separately so "what is X?" matches well
        self.q_vec = TfidfVectorizer(stop_words=STOP, ngram_range=(1, 2), sublinear_tf=True)
        self.Q = self.q_vec.fit_transform([q["question"] for q in self.questions])

        self._train_clusters()
        self._train_classifiers()
        self.trained = True
        return self

    def _train_clusters(self):
        n = self.X.shape[0]
        best_k, best_s, best_km = None, -1, None
        # cluster in a compact LSA space — far better separation than raw sparse TF-IDF
        comps = max(2, min(25, n - 1, self.X.shape[1] - 1))
        Z = Normalizer(copy=False).fit_transform(TruncatedSVD(comps, random_state=42).fit_transform(self.X))
        for k in range(5, min(11, n // 4 + 1)):
            km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(Z)
            s = silhouette_score(Z, km.labels_)
            if s > best_s:
                best_k, best_s, best_km = k, s, km
        self.km, self.k, self.silhouette = best_km, best_k, float(best_s)
        self.labels = self.km.labels_
        # term profile per cluster (for naming) from the original TF-IDF space
        self.centroids = np.vstack([np.asarray(self.X[self.labels == c].mean(axis=0)).ravel() for c in range(self.k)])
        svd = TruncatedSVD(n_components=2, random_state=42)
        self.xy = svd.fit_transform(self.X)

    def _train_classifiers(self):
        self.models, self.cv = {}, {}
        for field in ("category", "difficulty"):
            y = np.array([q[field] for q in self.questions])
            counts = Counter(y)
            folds = min(5, min(counts.values()))
            clf = LogisticRegression(max_iter=2000, C=8.0)
            entry = {"accuracy": None, "pred": None, "proba": None, "classes": None}
            if folds >= 2 and len(counts) > 1:
                cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
                proba = cross_val_predict(clf, self.X, y, cv=cv, method="predict_proba")
                classes = np.array(sorted(counts))
                pred = classes[proba.argmax(1)]
                entry.update(accuracy=float((pred == y).mean()), pred=pred, proba=proba, classes=classes)
            clf.fit(self.X, y)
            self.models[field] = clf
            self.cv[field] = entry

    # ───────────────────────────── analysis ─────────────────────────────
    def top_keywords(self, n=15):
        scores = np.asarray(self.X.sum(axis=0)).ravel()
        idx = scores.argsort()[::-1]
        out = []
        for i in idx:
            term = self.terms[i]
            if " " in term:  # keep single words for the chart; phrases come via clusters
                continue
            out.append({"term": term, "score": round(float(scores[i]), 2)})
            if len(out) == n:
                break
        return out

    def clusters(self):
        order = self.centroids.argsort(axis=1)[:, ::-1]
        res = []
        for c in range(self.k):
            members = np.where(self.labels == c)[0]
            top = [self.terms[i] for i in order[c][:8]]
            cats = Counter(self.questions[i]["category"] for i in members)
            main_cat, main_n = cats.most_common(1)[0]
            res.append({
                "id": int(c),
                "name": " · ".join(top[:3]),
                "keywords": top,
                "size": int(len(members)),
                "dominant_category": main_cat,
                "purity": round(main_n / len(members), 2),
                "examples": [self.questions[i]["question"] for i in members[:3]],
            })
        res.sort(key=lambda r: -r["size"])
        return res

    def scatter(self):
        return [{"x": round(float(x), 3), "y": round(float(y), 3), "cluster": int(c),
                 "category": q["category"], "q": q["question"]}
                for (x, y), c, q in zip(self.xy, self.labels, self.questions)]

    def audit(self):
        issues = []

        def add(q, kind, severity, detail, fix):
            issues.append({"id": q["id"], "question": q["question"], "category": q["category"],
                           "type": kind, "severity": severity, "detail": detail, "suggestion": fix})

        # 1) near-duplicate questions
        sim = cosine_similarity(self.Q)
        np.fill_diagonal(sim, 0)
        seen = set()
        for i, j in zip(*np.where(np.triu(sim) > 0.75)):
            seen.add((i, j))
            add(self.questions[i], "duplicate", "high",
                f"{sim[i, j]:.0%} similar to Q{self.questions[j]['id']}: “{self.questions[j]['question']}”",
                "Merge with the similar question or rephrase to cover a different angle.")

        wc = [len(_words(q["answer"])) for q in self.questions]
        med = float(np.median(wc))
        for q, w in zip(self.questions, wc):
            if w < max(12, med * 0.4):
                add(q, "thin-answer", "medium", f"Answer has only {w} words (dataset median {med:.0f}).",
                    "Expand with a definition, an example and a key number.")
            if w > med * 2.5:
                add(q, "long-answer", "low", f"Answer has {w} words (dataset median {med:.0f}).",
                    "Consider splitting into two questions or trimming.")
            if not q["question"].endswith("?"):
                add(q, "format", "low", "Question does not end with a question mark.", "Phrase as a question.")
        # 2) label problems found by the trained classifier (cross-validated)
        for field in ("category", "difficulty"):
            e = self.cv[field]
            if e["pred"] is None:
                continue
            cls = list(e["classes"])
            for i, q in enumerate(self.questions):
                if e["pred"][i] != q[field]:
                    conf = float(e["proba"][i].max())
                    thr = 0.4 if field == "category" else 0.6
                    if conf >= thr:
                        add(q, f"{field}-mismatch", "low",
                            f"Labelled {q[field]}, but the model predicts {e['pred'][i]} ({conf:.0%} confidence).",
                            f"Review whether '{e['pred'][i]}' is the better {field}.")
        order = {"high": 0, "medium": 1, "low": 2}
        issues.sort(key=lambda x: (order[x["severity"]], x["type"]))
        by_type = Counter(i["type"] for i in issues)
        flagged = len({i["id"] for i in issues})
        score = max(0, round(100 - 100 * flagged / len(self.questions) * 0.8))
        return {"quality_score": score, "flagged_questions": flagged, "total_issues": len(issues),
                "by_type": dict(by_type), "issues": issues[:80]}

    def metrics(self):
        return {
            "questions": len(self.questions),
            "clusters": self.k,
            "silhouette": round(self.silhouette, 3),
            "category_accuracy": None if self.cv["category"]["accuracy"] is None else round(self.cv["category"]["accuracy"], 3),
            "difficulty_accuracy": None if self.cv["difficulty"]["accuracy"] is None else round(self.cv["difficulty"]["accuracy"], 3),
            "vocabulary": int(len(self.terms)),
            "llm": self.llm_available(),
            "llm_model": CLAUDE_MODEL if self.llm_available() else None,
        }

    def insights(self):
        qs = self.questions
        n = len(qs)
        cats = Counter(q["category"] for q in qs)
        diffs = Counter(q["difficulty"] for q in qs)
        out = []

        def add(kind, title, text, severity="info"):
            out.append({"type": kind, "title": title, "text": text, "severity": severity})

        # coverage
        mean = n / len(cats)
        big, small = cats.most_common()[0], cats.most_common()[-1]
        add("coverage", "Category coverage",
            f"{big[0]} dominates with {big[1]} questions ({big[1]/n:.0%}); {small[0]} is thinnest with {small[1]} ({small[1]/n:.0%}).",
            "warn" if small[1] < mean * 0.5 else "info")
        for c, v in cats.items():
            if v < mean * 0.5:
                add("gap", f"Gap: {c}", f"Only {v} questions vs. an average of {mean:.0f} per category — add more {c} content.", "warn")

        # difficulty balance per category
        for c in cats:
            d = Counter(q["difficulty"] for q in qs if q["category"] == c)
            if len(d) < len(diffs) and cats[c] >= 5:
                missing = ", ".join(sorted(set(diffs) - set(d)))
                add("balance", f"{c}: missing difficulty", f"No {missing} questions in {c}.", "warn")
        top_d = diffs.most_common(1)[0]
        add("difficulty", "Difficulty mix",
            ", ".join(f"{d} {v/n:.0%}" for d, v in sorted(diffs.items())) + f". Most common: {top_d[0]}.")

        # answer length
        by_len = {c: np.mean([len(_words(q["answer"])) for q in qs if q["category"] == c]) for c in cats}
        lo, hi = min(by_len, key=by_len.get), max(by_len, key=by_len.get)
        add("depth", "Answer depth",
            f"{hi} answers are the most detailed ({by_len[hi]:.0f} words avg); {lo} answers are the shortest ({by_len[lo]:.0f}).")

        # model separability
        acc = self.cv["category"]["accuracy"]
        if acc is not None:
            conf = Counter()
            for t, p in zip([q["category"] for q in qs], self.cv["category"]["pred"]):
                if t != p:
                    conf[(t, p)] += 1
            extra = ""
            if conf:
                (a, b), v = conf.most_common(1)[0]
                extra = f" Most confusion: {a} questions read like {b} ({v} cases)."
            add("model", "Category predictability",
                f"A model trained on the text predicts the category with {acc:.0%} cross-validated accuracy.{extra}",
                "warn" if acc < 0.6 else "good")

        # topics
        cl = self.clusters()
        big_c = cl[0]
        add("topics", "Largest topic cluster",
            f"“{big_c['name']}” covers {big_c['size']} questions (mostly {big_c['dominant_category']}, {big_c['purity']:.0%} pure).")
        mixed = [c for c in cl if c["purity"] < 0.5 and c["size"] >= 4]
        if mixed:
            m = mixed[0]
            add("topics", "Cross-category theme",
                f"“{m['name']}” spans several categories — a theme that could become its own category.")

        aud = self.audit()
        add("quality", "Data quality", f"Quality score {aud['quality_score']}/100: {aud['flagged_questions']} questions flagged "
            f"({', '.join(f'{v} {k}' for k, v in aud['by_type'].items()) or 'no issues'}).",
            "good" if aud["quality_score"] >= 85 else "warn")
        return out

    def summary(self, insights):
        """Executive summary: Claude if available, otherwise stitched from the insights."""
        if self.llm_available():
            try:
                facts = "\n".join(f"- {i['title']}: {i['text']}" for i in insights)
                return self._claude(
                    "You are a data analyst. Write a concise 3-4 sentence executive summary of this dataset "
                    "analysis for a dashboard. Plain text, no markdown.\n\n" + facts, max_tokens=300)
            except Exception:
                pass
        pick = [i for i in insights if i["type"] in ("coverage", "gap", "model", "quality")][:4]
        return " ".join(i["text"] for i in pick)

    # ───────────────────────────── chat / predict ─────────────────────────────
    def classify(self, text):
        v = self.vec.transform([text])
        out = {}
        for field, clf in self.models.items():
            p = clf.predict_proba(v)[0]
            idx = p.argsort()[::-1][:3]
            out[field] = [{"label": str(clf.classes_[i]), "confidence": round(float(p[i]), 3)} for i in idx]
        c = int(cosine_similarity(v, self.centroids).argmax())
        out["cluster"] = c
        return out

    def search(self, query, k=3):
        s = cosine_similarity(self.q_vec.transform([query]), self.Q).ravel()
        s2 = cosine_similarity(self.vec.transform([query]), self.X).ravel()
        score = 0.6 * s + 0.4 * s2
        idx = score.argsort()[::-1][:k]
        return [(self.questions[i], float(score[i])) for i in idx]

    def chat(self, message):
        msg = message.strip()
        low = msg.lower()
        # analytic questions answered from the data itself
        stat = self._stat_answer(low)
        if stat:
            return stat
        hits = [(q, s) for q, s in self.search(msg) if s > 0.08]
        if not hits:
            return {"answer": "I couldn't find anything in the dataset related to that. Try asking about "
                              "grading, history, pricing, mining, jewelry, science or care.",
                    "sources": [], "mode": "local"}
        sources = [{"id": q["id"], "question": q["question"], "category": q["category"],
                    "difficulty": q["difficulty"], "score": round(s, 2)} for q, s in hits]
        if self.llm_available():
            try:
                ctx = "\n\n".join(f"Q: {q['question']}\nA: {q['answer']}" for q, _ in hits)
                ans = self._claude(
                    "Answer the user's question using ONLY the dataset entries below. If they don't cover it, say so. "
                    f"Be concise.\n\nDATASET ENTRIES:\n{ctx}\n\nUSER QUESTION: {msg}", max_tokens=500)
                return {"answer": ans, "sources": sources, "mode": "claude"}
            except Exception:
                pass
        best, score = hits[0]
        return {"answer": best["answer"], "sources": sources, "mode": "local",
                "matched_question": best["question"], "confidence": round(score, 2)}

    def _stat_answer(self, low):
        qs = self.questions
        n = len(qs)
        if re.search(r"how many (questions|entries)|total (questions|entries)|size of", low) and "categor" not in low:
            return {"answer": f"The dataset has {n} questions.", "sources": [], "mode": "stats"}
        if "categor" in low and re.search(r"how many|list|count|breakdown|distribution", low):
            c = Counter(q["category"] for q in qs)
            return {"answer": "Questions per category: " + ", ".join(f"{k} {v}" for k, v in c.most_common()) + ".",
                    "sources": [], "mode": "stats"}
        if "difficult" in low and re.search(r"how many|count|breakdown|distribution|mix", low):
            c = Counter(q["difficulty"] for q in qs)
            return {"answer": "By difficulty: " + ", ".join(f"{k} {v}" for k, v in c.most_common()) + ".",
                    "sources": [], "mode": "stats"}
        if re.search(r"\b(gaps?|missing|weak|thin|improve|weakest)\b", low):
            gaps = [i["text"] for i in self.insights() if i["type"] in ("gap", "balance")]
            return {"answer": " ".join(gaps) or "No major gaps found.", "sources": [], "mode": "stats"}
        if re.search(r"quality|duplicate|issues|audit", low):
            a = self.audit()
            return {"answer": f"Quality score {a['quality_score']}/100 with {a['total_issues']} issues across "
                              f"{a['flagged_questions']} questions ({', '.join(f'{v} {k}' for k, v in a['by_type'].items())}).",
                    "sources": [], "mode": "stats"}
        if re.search(r"topic|theme|cluster|keyword", low):
            cl = self.clusters()[:5]
            return {"answer": "Main themes: " + "; ".join(f"{c['name']} ({c['size']})" for c in cl) + ".",
                    "sources": [], "mode": "stats"}
        return None

    # ───────────────────────────── LLM helper ─────────────────────────────
    @staticmethod
    def llm_available():
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return False
        try:
            import anthropic  # noqa: F401
            return True
        except ImportError:
            return False

    @staticmethod
    def _claude(prompt, max_tokens=400):
        import anthropic
        client = anthropic.Anthropic()
        r = client.messages.create(model=CLAUDE_MODEL, max_tokens=max_tokens,
                                   messages=[{"role": "user", "content": prompt}])
        return "".join(b.text for b in r.content if b.type == "text").strip()

    # ───────────────────────────── full report ─────────────────────────────
    def report(self):
        ins = self.insights()
        return {"fingerprint": self.fingerprint, "metrics": self.metrics(), "summary": self.summary(ins),
                "insights": ins, "audit": self.audit(), "clusters": self.clusters(),
                "keywords": self.top_keywords(), "scatter": self.scatter()}
