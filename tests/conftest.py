"""Shared pytest fixtures."""
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


@pytest.fixture(scope="session")
def app_module():
    """Import the Flask app exactly once per test session."""
    import app as app_module
    return app_module


@pytest.fixture()
def client(app_module):
    """Flask test client."""
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


@pytest.fixture()
def default_geom():
    """Reference geometry: 1.5 m wingspan, 2.5 kg, NACA 2412, defaults."""
    from backend.geometry import calculate_geometry
    return calculate_geometry(1.5, 2.5, "2412")


@pytest.fixture()
def airfoil_props_2412():
    from backend.airfoil import get_airfoil_properties
    return get_airfoil_properties("2412")


@pytest.fixture()
def airfoil_props_0012():
    from backend.airfoil import get_airfoil_properties
    return get_airfoil_properties("0012")


@pytest.fixture()
def airfoil_props_4412():
    from backend.airfoil import get_airfoil_properties
    return get_airfoil_properties("4412")
