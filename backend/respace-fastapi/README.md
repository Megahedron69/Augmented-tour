# ReSpace FastAPI Wrapper

FastAPI service that sits alongside your frontend and provides a clean `/respace/run` endpoint.

## Folder Structure

- `app/main.py`: FastAPI routes
- `app/schemas.py`: request/response models
- `app/services/respace_runner.py`: ReSpace adapter (mock + real modes)
- `.env.example`: runtime config
- `requirements.txt`: Python dependencies for wrapper

## 1) Create Python Environment

```bash
cd backend/respace-fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) Clone and Prepare ReSpace (proper setup)

Follow the official installation guidance from the ReSpace README:

```bash
cd ../..
git clone https://github.com/GradientSpaces/respace.git
cd respace

# Recommended by project docs
conda create -n respace python=3.9 -y
conda activate respace
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cu121
conda install cudnn=9 -c conda-forge -y
conda install nccl -c conda-forge -y
```

### Required datasets/assets from ReSpace docs

You need **both** catalogs:

1. **3D-FUTURE assets** (Alibaba, application/approval required)
2. **3D-FRONT scenes** (Alibaba, application/approval required)

Set paths in the ReSpace `.env`:

- `PTH_3DFUTURE_ASSETS=...`
- `PTH_3DFRONT_SCENES=...`

### Required preprocessing from docs

Run in `respace` repo:

```bash
python ./src/preprocessing/3d-front/01_convert_assets_obj_glb.py
python ./src/preprocessing/3d-front/scale_assets.py
```

Then ensure metadata cache exists (required for sampling engine):

- Place downloaded cache file at `./data/metadata/model_info_3dfuture_assets_embeds.pickle`
  - or run cache build:

```bash
python ./src/preprocessing/3d-front/06_compute_embeds.py
```

## 3) Configure wrapper

Copy environment file:

```bash
cd ../mixedRealityHouse/backend/respace-fastapi
cp .env.example .env
```

Set:

- `ENABLE_REAL_RESPACE=true`
- `RESPACE_REPO_PATH=/absolute/path/to/respace`
- `RESPACE_MODEL_ID=` (optional, defaults to repo behavior)
- `RESPACE_MAX_ATTEMPTS=3` (recommended to prevent very long retry loops)
- `RESPACE_ASSET_RESAMPLE_ATTEMPTS=3` (retries asset resampling when sampled meshes are missing locally)
- `RESPACE_ENABLE_RENDER=true` (optional, writes renders)
- `RESPACE_RENDER_OUTPUT=./outputs`

For OpenAI command-planner mode (recommended to avoid local planner model startup delays):

- `OPENAI_API_KEY=...`
- `RESPACE_COMMAND_PLANNER_BACKEND=openai`
- `RESPACE_OPENAI_MODEL=gpt-4.1-mini` (or another chat-completions model)

## 4) Run FastAPI server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 5) Frontend wiring

Set frontend env:

- `VITE_RESPACE_LOCAL_API_URL=http://localhost:8000/respace/run`

Then in Feature 2 upload flow, Step 3 will call this endpoint.

## API

### `GET /health`

Returns server status.

### `GET /assets/3dfuture/list?page=1&page_size=25`

Returns paginated asset catalog items from `PTH_3DFUTURE_ASSETS` for manual placement.

- Default page size is 25 (max 100)
- Optional `search` query filters asset ids

### `POST /respace/run`

Payload shape (example):

```json
{
  "source": "RasterScan/Automated-Floor-Plan-Digitalization",
  "geometry": {
    "doors": [],
    "walls": [],
    "rooms": []
  },
  "generationConfig": {
    "wallHeight": 3,
    "wallThickness": 0.15,
    "unitScale": 0.01,
    "prompt": "Generate a realistic furnished interior while preserving walkable paths and door clearances."
  }
}
```

## Notes

- `mock` mode works without ReSpace to validate integration.
- `real` mode calls `ReSpace().handle_prompt(...)` through the wrapper.
- For high-quality full scenes, complete all official asset + preprocessing steps first.
- If requests feel stuck, reduce `RESPACE_MAX_ATTEMPTS` (for example `1` or `2`) to fail fast when the model does not produce valid commands.
