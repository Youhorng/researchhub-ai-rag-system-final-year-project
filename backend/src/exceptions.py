from fastapi import Request
from fastapi.responses import JSONResponse


# Define domain exception classes
class NotFoundError(Exception):
    def __init__(self, resource: str, identifier: str = ""):
        self.resource = resource
        self.identifier = identifier
        super().__init__(f"{resource} not found")


class ForbiddenError(Exception):
    def __init__(self, message: str = "Access denied"):
        self.message = message
        super().__init__(message)


class ConflictError(Exception):
    def __init__(self, message: str = "Resource already exists"):
        self.message = message
        super().__init__(message)


class UnprocessableError(Exception):
    def __init__(self, message: str = "Invalid input"):
        super().__init__(message)
        self.message = message


# Define exception handlers to convert exceptions to JSON responses
def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    detail = f"{exc.resource} not found"
    if exc.identifier:
        detail = f"{exc.resource} '{exc.identifier}' not found"
    return JSONResponse(status_code=404, content={"detail": detail})


def forbidden_handler(request: Request, exc: ForbiddenError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": exc.message})


def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": exc.message})

    
def unprocessable_handler(request: Request, exc: UnprocessableError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.message})


# Define a helper list
exception_handlers = [
    (NotFoundError, not_found_handler),
    (ForbiddenError, forbidden_handler),
    (ConflictError, conflict_handler),
    (UnprocessableError, unprocessable_handler),
]