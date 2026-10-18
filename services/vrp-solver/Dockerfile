# Image du solveur VRP. OR-Tools fournit des roues precompilees : pas de
# chaine de compilation C++ a embarquer, l'image reste raisonnable.
FROM python:3.12-slim

WORKDIR /app

# Les dependances d'abord, pour que le cache de couches survive a une
# modification du code.
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir \
       "fastapi>=0.115" "uvicorn[standard]>=0.32" "ortools>=9.11" "pydantic>=2.9"

COPY app ./app

# Utilisateur non privilegie : ce service analyse des donnees venues de
# l'exterieur, il n'a aucune raison de tourner en root.
RUN useradd --create-home --uid 10001 sira
USER sira

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
