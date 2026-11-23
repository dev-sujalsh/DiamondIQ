"""Train the agent on diamonds.json and write agent/analysis.json (static fallback for the dashboard).

    python agent/train.py            # default dataset
    python agent/train.py path.json  # another dataset
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from agent import DiamondAgent  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "diamonds.json")
    data = json.load(open(src, encoding="utf-8"))
    agent = DiamondAgent(data["questions"]).train()
    report = agent.report()
    out = os.path.join(os.path.dirname(__file__), "analysis.json")
    json.dump(report, open(out, "w", encoding="utf-8"), indent=1)
    m = report["metrics"]
    print(f"Trained on {m['questions']} questions")
    print(f"  clusters: {m['clusters']} (silhouette {m['silhouette']})")
    print(f"  category accuracy (CV): {m['category_accuracy']}  difficulty: {m['difficulty_accuracy']}")
    print(f"  quality score: {report['audit']['quality_score']}/100, issues: {report['audit']['total_issues']}")
    print(f"  wrote {out}")


if __name__ == "__main__":
    main()
