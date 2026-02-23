#!/bin/bash
# PostgreSQL initialization script
# Runs automatically on first container startup (postgres_data volume is empty).
# Creates both application databases in one PostgreSQL server instance.
#
# Docker mounts all *.sh files from /docker-entrypoint-initdb.d/ and runs them
# in alphabetical order AFTER the primary database (POSTGRES_DB) is created.
# We use "01_" prefix to control ordering.

set -e

echo "=== Creating ResearchHub databases ==="

# POSTGRES_USER and POSTGRES_DB are already created by the official postgres image
# using the POSTGRES_DB environment variable. We only need to create airflow_db.

# Create the Airflow database
# The "|| true" prevents failure if it already exists (idempotent)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE airflow_db'
    WHERE NOT EXISTS (
        SELECT FROM pg_database WHERE datname = 'airflow_db'
    )\gexec

    GRANT ALL PRIVILEGES ON DATABASE airflow_db TO $POSTGRES_USER;
EOSQL

echo "=== Databases ready ==="
echo "  - ${POSTGRES_DB}  (app database)"
echo "  - airflow_db      (airflow internal tables)"
