from typing import Protocol


class ExportEmailProvider(Protocol):
    """Future server-only adapter. Authenticate/limit sending before exposing a route.

    A transactional provider must read its key from server environment variables.
    Attach generate_materials_excel(snapshot) without regenerating the estimate.
    No sender is configured or invoked in this iteration.
    """

    async def send_materials(self, *, recipient: str, filename: str, attachment: bytes) -> None: ...
