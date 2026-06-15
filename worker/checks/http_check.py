import aiohttp
import asyncio
import time
from typing import Tuple, Optional


async def http_check(url: str, method: str = "GET", timeout: int = 10,
                     expected_status: int = 200, headers: dict = None,
                     body: str = None) -> Tuple[bool, Optional[float], Optional[int], Optional[str]]:
    start = time.monotonic()
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            kwargs = {
                "timeout": aiohttp.ClientTimeout(total=timeout),
                "headers": headers or {},
                "allow_redirects": True,
            }
            if body and method in ("POST", "PUT", "PATCH"):
                kwargs["data"] = body
            async with session.request(method, url, **kwargs) as response:
                elapsed = (time.monotonic() - start) * 1000  # ms
                is_up = response.status == expected_status
                error = None if is_up else f"Expected {expected_status}, got {response.status}"
                return is_up, round(elapsed, 2), response.status, error
    except aiohttp.ClientConnectorError as e:
        elapsed = (time.monotonic() - start) * 1000
        return False, round(elapsed, 2), None, f"Connection error: {str(e)[:200]}"
    except asyncio.TimeoutError:
        elapsed = (time.monotonic() - start) * 1000
        return False, round(elapsed, 2), None, f"Timeout after {timeout}s"
    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        return False, round(elapsed, 2), None, str(e)[:200]
