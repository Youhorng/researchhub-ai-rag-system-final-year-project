from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="ResearchHub API",
    description="AI-powered research paper discovery and RAG system",
    version="0.1.0",
)

# Allow frontend (localhost:3000) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint — used by Docker healthcheck and monitoring."""
    return {
        "status": "ok",
        "service": "researchhub-api",
        "version": "0.1.0",
    }


@app.get("/")
async def root():
    return {"message": "ResearchHub API is running. Visit /docs for API documentation."}
