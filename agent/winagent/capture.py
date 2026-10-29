import base64
import io

from .gate import ScreenGate


def grab_jpeg_b64(gate: ScreenGate, task_id: str, max_width: int = 1280, quality: int = 60) -> str:
    """يلتقط الشاشة فقط إذا سمحت البوابة. mss وPillow يُستوردان هنا فقط (عند الحاجة)."""
    gate.require(task_id)
    import mss
    from PIL import Image
    with mss.mss() as sct:
        shot = sct.grab(sct.monitors[1])
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
    if img.width > max_width:
        img = img.resize((max_width, int(img.height * max_width / img.width)))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True)
    return base64.b64encode(buf.getvalue()).decode()
