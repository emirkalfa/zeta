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
