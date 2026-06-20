"""MIME types customizados do PyKortex (compartilhados com o frontend)."""

# Bundle de DataFrame: janela de linhas + schema + shape.
DATAFRAME_MIME = "application/vnd.pykortex.dataframe+json"

# Explorador de app FastAPI: rotas + request/response.
FASTAPI_MIME = "application/vnd.pykortex.fastapi+json"

# Schema do SQLAlchemy: tabelas + colunas + relações.
SQLALCHEMY_MIME = "application/vnd.pykortex.sqlalchemy+json"
