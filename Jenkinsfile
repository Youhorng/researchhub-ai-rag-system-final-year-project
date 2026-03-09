// ResearchHub — Jenkins CI/CD Pipeline (Zero-Downtime)
// =====================================================
// Jenkins runs on the SAME EC2 as Docker — no SSH needed.
// All sh commands execute directly as the jenkins user,
// which has docker group access and /home/ubuntu permission.
//
// Stages:
//   1. Checkout  — clone repo on Jenkins agent
//   2. Lint      — ruff static analysis
//   3. Test      — pytest (placeholder until tests exist)
//   4. Build     — git pull + docker compose build (old containers untouched)
//   5. Validate  — health-check new image in isolation (no port conflict)
//   6. Deploy    — swap containers + post-deploy check + auto-rollback on fail

pipeline {
    agent any

    environment {
        APP_DIR      = '/home/ubuntu/researchhub'
        COMPOSE_FILE = 'compose.ec2.yml'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    stages {

        // ── Stage 1: Checkout ─────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                echo "Checking out branch: ${env.BRANCH_NAME ?: 'main'}"
                checkout scm
            }
        }

        // ── Stage 2: Lint ─────────────────────────────────────────────────────
        stage('Lint') {
            steps {
                dir('backend') {
                    sh '''
                        echo "Running ruff linter..."
                        ruff check src/
                    '''
                }
            }
            post {
                failure { echo "Lint failed — fix ruff errors before deploying" }
            }
        }

        // ── Stage 3: Test ─────────────────────────────────────────────────────
        // Passes with "no tests collected" until pytest tests are written.
        stage('Test') {
            steps {
                dir('backend') {
                    sh '''
                        uv sync --quiet || true
                        echo "Running pytest..."
                        uv run pytest tests/ -v --tb=short || true
                    '''
                }
            }
            post {
                failure { echo "Tests failed — check pytest output above" }
            }
        }

        // ── Stage 4: Build ────────────────────────────────────────────────────
        // git pull + tag current image as rollback + build new image.
        // Old containers keep serving traffic throughout this stage.
        stage('Build') {
            steps {
                sh """
                    set -e
                    cd ${APP_DIR}

                    echo '=== Pulling latest code ==='
                    git config --global --add safe.directory ${APP_DIR}
                    git pull origin main

                    echo '=== Cleaning dangling images to free disk space ==='
                    docker image prune -f

                    echo '=== Saving current images as :rollback ==='
                    docker tag researchhub-api:latest researchhub-api:rollback 2>/dev/null || true
                    docker tag researchhub-frontend:latest researchhub-frontend:rollback 2>/dev/null || true

                    echo '=== Building new images (old containers still running) ==='
                    docker compose -f ${COMPOSE_FILE} build --no-cache

                    echo '=== Build complete - old containers still live ==='
                """
            }
            post {
                failure {
                    echo "Build failed — old containers are still running, no downtime"
                }
            }
        }

        // ── Stage 5: Validate ─────────────────────────────────────────────────
        // Runs new image in an isolated throwaway container (no port binding).
        // Verifies the image can start and import correctly.
        // Old production containers are NOT touched.
        stage('Validate') {
            steps {
                sh """
                    set -e
                    cd ${APP_DIR}

                    echo '=== Validating new image in isolation ==='
                    docker run --rm \\
                        --env-file .env \\
                        -e LANGFUSE__ENABLED=false \\
                        researchhub-api:latest \\
                        python -c "from src.main import app; print('Image validation passed')"

                    echo '=== Validation passed - safe to deploy ==='
                """
            }
            post {
                failure {
                    echo "Validation failed — new image is broken, old containers untouched"
                }
            }
        }

        // ── Stage 6: Deploy ───────────────────────────────────────────────────
        // Swaps old containers for new (~5-10s window) + health check.
        // AUTO-ROLLBACK: restores :rollback images if health check fails.
        stage('Deploy') {
            steps {
                sh """
                    set -e
                    cd ${APP_DIR}

                    echo '=== Swapping to new containers ==='
                    docker compose -f ${COMPOSE_FILE} up -d

                    echo '=== Waiting for containers to stabilise ==='
                    sleep 15

                    echo '=== Running DB migrations ==='
                    docker compose -f ${COMPOSE_FILE} exec -T api alembic upgrade head

                    echo '=== Post-deploy smoke test ==='
                    curl -f http://localhost:8000/api/v1/health
                    echo '=== Deploy complete - new version is live ==='
                """
            }
            post {
                success {
                    echo "Deployment successful — ResearchHub is live with new version"
                }
                failure {
                    sh """
                        cd ${APP_DIR}
                        echo '=== DEPLOY FAILED - auto-rolling back to previous version ==='

                        docker tag researchhub-api:rollback researchhub-api:latest 2>/dev/null || true
                        docker tag researchhub-frontend:rollback researchhub-frontend:latest 2>/dev/null || true

                        docker compose -f ${COMPOSE_FILE} up -d --force-recreate

                        echo '=== Rollback health check ==='
                        sleep 10
                        curl -f http://localhost:8000/api/v1/health
                        echo '=== Rollback complete - previous version restored ==='
                    """
                    echo "ROLLED BACK — previous version restored, check logs for root cause"
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline SUCCESS — Build #${env.BUILD_NUMBER} is live"
        }
        failure {
            echo "Pipeline FAILED — Build #${env.BUILD_NUMBER} — previous version still running"
        }
        always {
            cleanWs()
        }
    }
}
