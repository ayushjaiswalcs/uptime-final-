"""Singleton WebSocket connection manager shared between main.py and monitoring.py."""
import asyncio
import json
import logging
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger("uptime.ws")


class ConnectionManager:
    def __init__(self):
        self.connections: Dict[int, List[WebSocket]] = {}
        # The running event loop — set once on first connect so threads can
        # schedule coroutines onto it via run_coroutine_threadsafe.
        self._loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self._loop = asyncio.get_running_loop()
        if user_id not in self.connections:
            self.connections[user_id] = []
        self.connections[user_id].append(websocket)
        logger.debug("WS connected user=%s (total=%s)", user_id, len(self.connections[user_id]))

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.connections:
            try:
                self.connections[user_id].remove(websocket)
            except ValueError:
                pass

    async def send_to_user(self, user_id: int, message: dict):
        if user_id not in self.connections:
            return
        dead = []
        for ws in self.connections[user_id]:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[user_id].remove(ws)

    def broadcast_from_thread(self, user_id: int, message: dict):
        """Thread-safe broadcast — call this from check_monitor (runs in a thread)."""
        if not self._loop or not self._loop.is_running():
            return
        if user_id not in self.connections or not self.connections[user_id]:
            return
        asyncio.run_coroutine_threadsafe(self.send_to_user(user_id, message), self._loop)


# Single shared instance imported by both main.py and monitoring.py.
manager = ConnectionManager()
