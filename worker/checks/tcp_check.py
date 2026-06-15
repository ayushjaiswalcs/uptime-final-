import asyncio
import time
from typing import Tuple, Optional


async def tcp_check(host: str, port: int, timeout: int = 10) -> Tuple[bool, Optional[float], Optional[str]]:
    start = time.monotonic()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        elapsed = (time.monotonic() - start) * 1000
        writer.close()
        await writer.wait_closed()
        return True, round(elapsed, 2), None
    except asyncio.TimeoutError:
        elapsed = (time.monotonic() - start) * 1000
        return False, round(elapsed, 2), f"TCP timeout after {timeout}s"
    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        return False, round(elapsed, 2), str(e)[:200]
