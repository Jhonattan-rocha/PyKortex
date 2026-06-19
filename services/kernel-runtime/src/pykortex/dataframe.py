"""Viewer nativo de DataFrame — registrado pela MESMA API pública (dogfooding)."""

from __future__ import annotations

from typing import Any

import pandas as pd

from pykortex.api import viewer
from pykortex.mime import DATAFRAME_MIME
from pykortex.view import build_dataframe_payload


@viewer(pd.DataFrame)
def _view_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    return {
        DATAFRAME_MIME: build_dataframe_payload(df),
        "text/plain": f"DataFrame [{df.shape[0]} linhas x {df.shape[1]} colunas]",
    }


@viewer(pd.Series)
def _view_series(s: pd.Series) -> dict[str, Any]:
    # Uma Series é exibida como um DataFrame de uma coluna.
    df = s.to_frame()
    return {
        DATAFRAME_MIME: build_dataframe_payload(df),
        "text/plain": f"Series [{s.shape[0]}] dtype={s.dtype}",
    }
