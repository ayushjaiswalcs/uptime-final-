import ssl
import socket
from datetime import datetime, timezone
from typing import Tuple, Optional


def ssl_check(hostname: str, port: int = 443, warn_days: int = 30) -> Tuple[bool, Optional[float], Optional[str]]:
    try:
        ctx = ssl.create_default_context()
        conn = ctx.wrap_socket(socket.socket(), server_hostname=hostname)
        conn.settimeout(10)
        conn.connect((hostname, port))
        cert = conn.getpeercert()
        conn.close()

        expire_str = cert.get("notAfter", "")
        expire_dt = datetime.strptime(expire_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        days_left = (expire_dt - datetime.now(timezone.utc)).days

        if days_left <= 0:
            return False, None, f"SSL certificate expired {abs(days_left)} days ago"
        if days_left <= warn_days:
            return False, None, f"SSL certificate expires in {days_left} days"
        return True, None, None
    except ssl.SSLCertVerificationError as e:
        return False, None, f"SSL verification failed: {str(e)}"
    except Exception as e:
        return False, None, str(e)[:200]
