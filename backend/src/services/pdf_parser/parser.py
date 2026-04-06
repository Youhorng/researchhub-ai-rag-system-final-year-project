import logging
import tempfile

import httpx
import pymupdf

logger = logging.getLogger(__name__)

MAX_PAGES = 40

# Browser-like User-Agent so arXiv and other academic sites serve PDFs to server IPs.
# Without this, arXiv returns 403 or redirects to an HTML page on cloud provider IPs.
_DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


def parse_pdf_from_url(pdf_url: str, max_pages: int = MAX_PAGES) -> str:
    """Download a PDF from a URL and extract text using PyMuPDF.

    Args:
        pdf_url: Direct URL to the PDF file (e.g. https://arxiv.org/pdf/2312.01234).
        max_pages: Maximum number of pages to extract. Pages beyond this are ignored.

    Returns:
        Extracted text from the PDF.

    Raises:
        RuntimeError: If download or parsing fails.
    """
    try:
        logger.info("Downloading PDF from %s", pdf_url)
        with httpx.Client(timeout=120.0, follow_redirects=True, headers=_DOWNLOAD_HEADERS) as client:
            response = client.get(pdf_url)
            response.raise_for_status()

        logger.info("Parsing PDF with PyMuPDF (%d bytes, max %d pages)", len(response.content), max_pages)

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
            tmp.write(response.content)
            tmp.flush()

            doc = pymupdf.open(tmp.name)
            pages_to_read = min(len(doc), max_pages)
            text_parts: list[str] = []

            for i in range(pages_to_read):
                page_text = doc[i].get_text()
                if page_text.strip():
                    text_parts.append(page_text)

            doc.close()

        text = "\n\n".join(text_parts)

        if not text.strip():
            raise RuntimeError("PyMuPDF returned empty text")

        logger.info(
            "PDF parsed successfully: %d pages, %d characters, ~%d words",
            pages_to_read,
            len(text),
            len(text.split()),
        )
        return text

    except httpx.HTTPError as e:
        raise RuntimeError(f"Failed to download PDF from {pdf_url}: {e}") from e
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to parse PDF from {pdf_url}: {e}") from e


def parse_pdf_from_bytes(pdf_bytes: bytes, max_pages: int = MAX_PAGES) -> str:
    """Extract text from raw PDF bytes using PyMuPDF.

    Same logic as parse_pdf_from_url but skips the download step.

    Args:
        pdf_bytes: Raw PDF file content.
        max_pages: Maximum number of pages to extract.

    Returns:
        Extracted text from the PDF.

    Raises:
        RuntimeError: If parsing fails.
    """
    try:
        logger.info("Parsing PDF from bytes (%d bytes, max %d pages)", len(pdf_bytes), max_pages)

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
            tmp.write(pdf_bytes)
            tmp.flush()

            doc = pymupdf.open(tmp.name)
            pages_to_read = min(len(doc), max_pages)
            text_parts: list[str] = []

            for i in range(pages_to_read):
                page_text = doc[i].get_text()
                if page_text.strip():
                    text_parts.append(page_text)

            doc.close()

        text = "\n\n".join(text_parts)

        if not text.strip():
            raise RuntimeError("PyMuPDF returned empty text")

        logger.info(
            "PDF parsed successfully: %d pages, %d characters, ~%d words",
            pages_to_read,
            len(text),
            len(text.split()),
        )
        return text

    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to parse PDF from bytes: {e}") from e
