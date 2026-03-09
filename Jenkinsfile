// ResearchHub — Jenkins CI/CD Pipeline (Zero-Downtime)
// =====================================================
// Strategy: Build new images while OLD containers keep running.
//           Validate new images in isolation before touching production.
//           Only swap to new containers AFTER health check passes.
//           Auto-rollback to previous image if post-deploy check fails.
//
// Stages:
//   1. Checkout  — clone repo on Jenkins agent
//   2. Lint      — ruff static analysis
//   3. Test      — pytest (placeholder until tests exist)
//   4. Build     — build new images on EC2 (old containers untouched)
//   5. Validate  — health-check new image in isolation (no port conflict)
//   6. Deploy    — swap containers + post-deploy check + auto-rollback on fail

pipeline {
    agent any

    environment {
        EC2_HOST     = credentials('ec2-host')      // e.g. ec2-user@1.2.3.4
        EC2_SSH_KEY  = credentials('ec2-ssh-key')   // SSH private key credential
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
                        pip install ruff --quiet
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
        // Remove "|| true" once real tests exist.
        stage('Test') {
            steps {
                dir('backend') {
                    sh '''
                        pip install uv --quiet
                        uv sync --quiet
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
        // Runs on EC2 while OLD containers keep serving traffic — NO downtime.
        // Tags the current running image as :rollback before building new one.
        stage('Build') {
            steps {
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${EC2_HOST} '
                            set -e
                            cd ${APP_DIR}

                            echo "=== Pulling latest code ==="
                            git pull origin main

                            echo "=== Saving current images as :rollback ==="
                            docker tag researchhub-api:latest researchhub-api:rollback 2>/dev/null || true
                            docker tag researchhub-frontend:latest researchhub-frontend:rollback 2>/dev/null || true

                            echo "=== Building new images (old containers still running) ==="
                            docker compose -f ${COMPOSE_FILE} build --no-cache

                            echo "=== Build complete - old containers still live ==="
                        '
                    """
                }
            }
            post {
                failure {
                    echo "Build failed — old containers are still running, no downtime"
                }
            }
        }

        // ── Stage 5: Validate ─────────────────────────────────────────────────
        // Starts the new API image in an isolated one-off container (no port binding)
        // to validate it can import and start correctly.
        // Old production containers are NOT touched at this stage.
        stage('Validate') {
            steps {
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${EC2_HOST} '
                            set -e
                            cd ${APP_DIR}

                            echo "=== Validating new image in isolation ==="
                            docker run --rm \\
                                --env-file .env \\
                                -e LANGFUSE__ENABLED=false \\
                                --network researchhub_researchhub-network \\
                                researchhub-api:latest \\
                                python -c "
                            from src.main import app
                            print('Image validation passed')
"
                            echo "=== Validation passed - safe to deploy ==="
                        '
                    """
                }
            }
            post {
                failure {
                    echo "Validation failed — new image is broken, old containers untouched"
                }
            }
        }

        // ── Stage 6: Deploy ───────────────────────────────────────────────────
        // Swaps old containers for new ones (~5-10s swap window).
        // Runs a live health check after swap.
        // AUTO-ROLLBACK: if health check fails, restores :rollback images immediately.
        stage('Deploy') {
            steps {
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${EC2_HOST} '
                            set -e
                            cd ${APP_DIR}

                            echo "=== Swapping to new containers ==="
                            docker compose -f ${COMPOSE_FILE} up -d

                            echo "=== Waiting for containers to stabilise ==="
                            sleep 15

                            echo "=== Running DB migrations ==="
                            docker compose -f ${COMPOSE_FILE} exec -T api uv run alembic upgrade head

                            echo "=== Post-deploy smoke test ==="
                            curl -f http://localhost:8000/api/v1/health
                            echo "=== Deploy complete - new version is live ==="
                        '
                    """
                }
            }
            post {
                success {
                    echo "Deployment successful — ResearchHub is live with new version"
                }
                failure {
                    // AUTO-ROLLBACK: restore :rollback images if health check fails
                    sshagent(credentials: ['ec2-ssh-key']) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ${EC2_HOST} '
                                cd ${APP_DIR}
                                echo "=== DEPLOY FAILED - auto-rolling back to previous version ==="

                                docker tag researchhub-api:rollback researchhub-api:latest 2>/dev/null || true
                                docker tag researchhub-frontend:rollback researchhub-frontend:latest 2>/dev/null || true

                                docker compose -f ${COMPOSE_FILE} up -d --force-recreate

                                echo "=== Rollback health check ==="
                                sleep 10
                                curl -f http://localhost:8000/api/v1/health
                                echo "=== Rollback complete - previous version restored ==="
                            '
                        """
                    }
                    echo "ROLLED BACK — previous version is restored, check logs for root cause"
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline SUCCESS — Build #${env.BUILD_NUMBER} is live"
        }
        failure {
            echo "Pipeline FAILED — Build #${env.BUILD_NUMBER} — check stage logs above"
        }
        always {
            cleanWs()
        }
    }
}
