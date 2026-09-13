import pytest

SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 170">'
       '<rect x="0" y="0" width="256" height="170" fill="black"/></svg>')


@pytest.fixture
def svg(tmp_path):
    path = tmp_path / "render.svg"
    path.write_text(SVG)
    return path
