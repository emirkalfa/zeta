"""Smoke tests for Flask API endpoints in app.py."""
import pytest


class TestIndex:
    def test_index_serves_html(self, client):
        r = client.get("/")
        assert r.status_code == 200
        assert b"ZETA" in r.data


class TestAirfoilEndpoints:
    def test_airfoil_list(self, client):
        r = client.get("/api/airfoils")
        assert r.status_code == 200
        data = r.get_json()
        assert isinstance(data, list)
        assert len(data) >= 1
        first = data[0]
        for key in ("id", "name", "code", "max_camber",
                    "max_camber_position", "max_thickness"):
            assert key in first

    def test_airfoil_detail(self, client):
        list_resp = client.get("/api/airfoils").get_json()
        airfoil_id = list_resp[0]["id"]
        r = client.get(f"/api/airfoil/{airfoil_id}")
        assert r.status_code == 200
        data = r.get_json()
        assert "coordinates" in data
        assert len(data["coordinates"]) > 10

    def test_airfoil_not_found(self, client):
        r = client.get("/api/airfoil/99999")
        assert r.status_code == 404

    def test_airfoil_props_endpoint(self, client):
        r = client.get("/api/airfoil_props/2412")
        assert r.status_code == 200
        data = r.get_json()
        assert "cl_alpha" in data
        assert "max_thickness" in data


class TestCalculate:
    def test_default_request(self, client):
        payload = {"wingspan": 1.5, "weight": 2.5, "airfoil_code": "2412"}
        r = client.post("/api/calculate", json=payload)
        assert r.status_code == 200
        data = r.get_json()
        assert data["wingspan"] == 1.5
        assert data["weight"] == 2.5
        assert "root_chord" in data and data["root_chord"] > 0

    def test_request_with_minimal_payload(self, client):
        r = client.post("/api/calculate", json={})
        assert r.status_code == 200

    def test_request_rectangular_wing(self, client):
        payload = {"wingspan": 2.0, "weight": 3.0, "airfoil_code": "0012",
                   "wing_shape": "rectangular"}
        r = client.post("/api/calculate", json=payload)
        assert r.status_code == 200
        data = r.get_json()
        assert data["taper_ratio"] == 1.0

    def test_manual_mode_request(self, client):
        payload = {
            "wingspan": 1.5, "weight": 2.5, "airfoil_code": "2412",
            "manual_mode": True,
            "man_root_chord": 0.25, "man_tip_chord": 0.12,
            "man_sweep": 8, "man_dihedral": 4,
            "man_htail_span": 0.5, "man_htail_root": 0.15, "man_htail_tip": 0.08,
            "man_htail_sweep": 3,
            "man_vtail_span": 0.3, "man_vtail_root": 0.15, "man_vtail_tip": 0.06,
        }
        r = client.post("/api/calculate", json=payload)
        assert r.status_code == 200
        data = r.get_json()
        assert data["root_chord"] == 0.25
        assert data["manual_mode"] is True


class TestAnalyze:
    def test_analyze_returns_polars(self, client):
        geom_resp = client.post("/api/calculate", json={"wingspan": 1.5, "weight": 2.5,
                                                        "airfoil_code": "2412"}).get_json()
        r = client.post("/api/analyze",
                        json={"geometry": geom_resp, "airfoil_code": "2412"})
        assert r.status_code == 200
        data = r.get_json()
        for key in ("cl_vs_alpha", "cd_vs_cl", "cm_vs_alpha", "efficiency",
                    "lift_distribution"):
            assert key in data


class TestStability:
    def test_stability_returns_flight_test(self, client):
        geom_resp = client.post("/api/calculate", json={"wingspan": 1.5, "weight": 2.5,
                                                        "airfoil_code": "2412"}).get_json()
        r = client.post("/api/stability",
                        json={"geometry": geom_resp,
                              "airfoil_code": "2412",
                              "tail_airfoil_code": "0012"})
        assert r.status_code == 200
        data = r.get_json()
        for key in ("stall_speed", "cruise_speed", "static_margin",
                    "stability_status", "overall_passed", "assessments"):
            assert key in data


class TestDesktopPresence:
    """Masaüstü modunda sunucunun kendini kapatma kararı."""

    @pytest.fixture(autouse=True)
    def reset(self, app_module):
        saved = dict(app_module._presence)
        yield
        app_module._presence.update(saved)

    def test_waits_for_first_contact(self, app_module):
        app_module._presence.update(started=0.0, seen=None, closing=None)
        assert not app_module._should_exit(10.0)
        assert app_module._should_exit(app_module.FIRST_CONTACT_TIMEOUT + 1.0)

    def test_stays_alive_while_heartbeats_arrive(self, app_module):
        app_module._presence.update(started=0.0, seen=100.0, closing=None)
        assert not app_module._should_exit(100.0 + app_module.HEARTBEAT_TIMEOUT - 1)
        assert app_module._should_exit(100.0 + app_module.HEARTBEAT_TIMEOUT + 1)

    def test_exits_shortly_after_page_closes(self, app_module):
        app_module._presence.update(started=0.0, seen=100.0, closing=101.0)
        assert not app_module._should_exit(102.0)
        assert app_module._should_exit(101.0 + app_module.CLOSE_GRACE + 1)

    def test_reload_cancels_pending_close(self, client, app_module):
        assert client.post('/api/closing').status_code == 204
        assert app_module._presence['closing'] is not None
        res = client.post('/api/heartbeat')
        assert res.get_json() == {'desktop': False}
        assert app_module._presence['closing'] is None
