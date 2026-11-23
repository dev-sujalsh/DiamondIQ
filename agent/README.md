# DiamondIQ AI Agent

An agent that trains on `diamonds.json` and powers the **AI Agent** page and the insight banner on the dashboard.

## Run
```bash
pip install -r agent/requirements.txt
python agent/train.py          # optional: trains, prints metrics, writes agent/analysis.json (static fallback)
python agent/server.py         # open http://localhost:3000
```
Optional Claude layer (executive summary + natural chat answers): `export ANTHROPIC_API_KEY=...`
(model via `CLAUDE_MODEL`, default `claude-sonnet-5-5`). Without a key everything runs locally.

## What is trained (agent/agent.py)
| Component | Method |
|---|---|
| Text model | TF-IDF (1–2 grams) over question + answer |
| Topics | KMeans on an LSA (SVD) space, k chosen by silhouette score |
| Category / difficulty predictors | Logistic regression, scored with cross-validation |
| Chat | Retrieval over the dataset + stats answers (counts, gaps, quality); Claude phrases the answer if enabled |
| Audit | Near-duplicates, thin/long answers, formatting, and labels the model confidently disagrees with |

## API
`POST /api/agent/analyze` · `POST /api/agent/chat {message}` · `POST /api/agent/classify {text}` · `GET /api/agent/status`.
Each POST also accepts `questions: [...]` (user-added Q&As), so the analysis updates when questions are added.

Opening `index.html` directly (no server) still shows the saved `analysis.json`, but chat and live re-analysis need the server.
