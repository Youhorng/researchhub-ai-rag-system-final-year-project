FROM python:3.12-slim

# Set environment variables
ENV AIRFLOW_HOME=/opt/airflow
ENV AIRFLOW_VERSION=2.10.3
ENV PYTHON_VERSION=3.12
ENV CONSTRAINT_URL="https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt"
# Ensure pip-installed binaries (airflow, uvicorn, etc.) are on PATH for all users
ENV PATH="/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"

# Install system dependencies
# poppler-utils + tesseract-ocr needed for PDF parsing (used by ResearchHub)
# procps provides pkill/pgrep for entrypoint cleanup of stale PID files
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        libpq-dev \
        poppler-utils \
        procps \
        tesseract-ocr \
        && rm -rf /var/lib/apt/lists/*

# Create airflow user with UID/GID 50000 for cross-platform compatibility
# This prevents volume permission issues on Linux hosts
RUN groupadd -r -g 50000 airflow && useradd -r -u 50000 -g airflow -d ${AIRFLOW_HOME} -s /bin/bash airflow

# Create airflow directories with proper ownership
RUN mkdir -p ${AIRFLOW_HOME} && \
    mkdir -p ${AIRFLOW_HOME}/dags && \
    mkdir -p ${AIRFLOW_HOME}/logs && \
    mkdir -p ${AIRFLOW_HOME}/plugins && \
    chown -R 50000:50000 ${AIRFLOW_HOME} && \
    chmod -R 755 ${AIRFLOW_HOME}

# Install Airflow with PostgreSQL support using the official constraint URL
# The constraint file pins all transitive deps to known-compatible versions
RUN pip install --no-cache-dir \
    "apache-airflow[postgres]==${AIRFLOW_VERSION}" \
    --constraint "${CONSTRAINT_URL}" \
    psycopg2-binary

# Copy requirements and install project dependencies
# requirements.txt mirrors backend/pyproject.toml so DAGs can import backend code
COPY requirements.txt /tmp/requirements-airflow.txt
RUN pip install --no-cache-dir -r /tmp/requirements-airflow.txt

# Verify airflow is installed and on PATH (fails build if not found)
RUN which airflow && airflow version

# Copy and set up entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Switch to airflow user and set working directory
USER airflow
WORKDIR ${AIRFLOW_HOME}

# Expose port
EXPOSE 8080

CMD ["/bin/bash", "/entrypoint.sh"]
