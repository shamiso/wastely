## Wastely ML

This folder contains the Python waste-volume model, a lightweight HTTP service, and a notebook flow that trains from the SvelteKit API.

Quick start:

```bash
python3 ml/service.py
```

Optional environment variables:

- `WASTELY_DATA_API`: training-data endpoint, default `http://127.0.0.1:5173/api/ml/training-data`
- `WASTELY_DATA_TOKEN`: token matching `ML_SHARED_TOKEN` from the app
- `WASTELY_MODEL_PATH`: where the trained model JSON is stored
- `WASTELY_MODEL_TOKEN`: bearer token required by the Python service
- `PORT`: service port, default `8123`

Aliases the service also accepts:

- `ML_SHARED_TOKEN` for `WASTELY_DATA_TOKEN`
- `ML_SERVICE_TOKEN` for `WASTELY_MODEL_TOKEN`

Notebook:

- Open `ml/notebooks/waste_volume_forecast.ipynb`
- Start the app so `/api/ml/training-data` is reachable
- Run the notebook cells to fetch data, train, evaluate, and save the model
