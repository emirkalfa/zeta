"""Tests for backend/stability.py - flight test (stall, cruise, climb, stability)."""
import pytest

from backend.geometry import calculate_geometry
from backend.stability import flight_test


REQUIRED_KEYS = {
    "stall_speed", "cruise_speed", "climb_rate", "static_margin",
    "neutral_point", "cg_position", "cl_max", "cl_opt", "cd_cruise",
    "drag_cruise", "power_required", "power_available",
    "stability_status", "stability_grade", "overall_passed", "assessments",
}


class TestFlightTestStructure:
    def test_all_required_keys_present(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert REQUIRED_KEYS.issubset(r.keys())

    def test_tail_props_optional(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412, tail_props=None)
        assert "stall_speed" in r

    def test_explicit_tail_props_supported(self, default_geom, airfoil_props_2412, airfoil_props_0012):
        r = flight_test(default_geom, airfoil_props_2412, tail_props=airfoil_props_0012)
        assert "stall_speed" in r


class TestPhysicalSanity:
    def test_speeds_positive(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert r["stall_speed"] > 0
        assert r["cruise_speed"] > 0

    def test_cruise_faster_than_stall(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert r["cruise_speed"] >= r["stall_speed"]

    def test_climb_rate_non_negative(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert r["climb_rate"] >= 0

    def test_drag_positive(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert r["drag_cruise"] > 0
        assert r["cd_cruise"] > 0

    def test_power_available_proportional_to_weight(self, airfoil_props_2412):
        g_light = calculate_geometry(1.5, 1.0, "2412")
        g_heavy = calculate_geometry(1.5, 5.0, "2412")
        r_light = flight_test(g_light, airfoil_props_2412)
        r_heavy = flight_test(g_heavy, airfoil_props_2412)
        assert r_heavy["power_available"] > r_light["power_available"]

    def test_heavier_plane_higher_stall_speed(self, airfoil_props_2412):
        g_light = calculate_geometry(1.5, 1.0, "2412")
        g_heavy = calculate_geometry(1.5, 5.0, "2412")
        r_light = flight_test(g_light, airfoil_props_2412)
        r_heavy = flight_test(g_heavy, airfoil_props_2412)
        assert r_heavy["stall_speed"] > r_light["stall_speed"]


class TestStabilityStatus:
    @pytest.mark.parametrize("status", ["Stabil", "Aşırı stabil (manevra kabiliyeti düşük)", "Kararsız"])
    def test_status_is_one_of_known(self, default_geom, airfoil_props_2412, status):
        r = flight_test(default_geom, airfoil_props_2412)
        assert r["stability_status"] in {
            "Stabil",
            "Aşırı stabil (manevra kabiliyeti düşük)",
            "Kararsız",
        }

    def test_overall_passed_is_boolean(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert isinstance(r["overall_passed"], bool)

    def test_assessments_non_empty_list(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert isinstance(r["assessments"], list)
        assert len(r["assessments"]) >= 3

    def test_downwash_gradient_varies_with_AR(self, airfoil_props_2412):
        """d_eps/d_alpha = 2*a_w/(pi*AR) so it must depend on AR, not be 0.5 constant."""
        g_low = calculate_geometry(1.5, 2.5, "2412", manual_mode=True,
                                   man_root_chord=0.30, man_tip_chord=0.30,
                                   man_htail_span=0.5, man_htail_root=0.2, man_htail_tip=0.1)
        g_high = calculate_geometry(1.5, 2.5, "2412", manual_mode=True,
                                    man_root_chord=0.20, man_tip_chord=0.20,
                                    man_htail_span=0.5, man_htail_root=0.2, man_htail_tip=0.1)
        # AR: b^2/S — same span, S=root*span: AR_low=5, AR_high=7.5
        assert g_low["aspect_ratio"] == pytest.approx(5.0, abs=0.1)
        assert g_high["aspect_ratio"] == pytest.approx(7.5, abs=0.1)
        r_low = flight_test(g_low, airfoil_props_2412)
        r_high = flight_test(g_high, airfoil_props_2412)
        # Different AR -> different d_eps -> different NP
        assert abs(r_low["neutral_point"] - r_high["neutral_point"]) > 0.01

    def test_sm_uses_wing_area_in_arms(self, airfoil_props_2412):
        """V_h = htail_area * arm / (S * MAC). Bigger htail -> bigger NP."""
        g_small = calculate_geometry(1.5, 2.5, "2412", manual_mode=True,
                                     man_root_chord=0.21, man_tip_chord=0.21,
                                     man_htail_span=0.4, man_htail_root=0.10, man_htail_tip=0.05)
        g_big = calculate_geometry(1.5, 2.5, "2412", manual_mode=True,
                                   man_root_chord=0.21, man_tip_chord=0.21,
                                   man_htail_span=0.6, man_htail_root=0.20, man_htail_tip=0.10)
        r_small = flight_test(g_small, airfoil_props_2412)
        r_big = flight_test(g_big, airfoil_props_2412)
        assert r_big["neutral_point"] > r_small["neutral_point"]

    def test_sm_within_physically_reasonable_range(self, default_geom, airfoil_props_2412):
        r = flight_test(default_geom, airfoil_props_2412)
        assert 0.0 <= r["static_margin"] / 100 <= 1.0, \
            f"Static margin out of range: {r['static_margin']}"
