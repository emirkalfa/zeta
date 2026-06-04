"""Tests for backend/airfoil.py - NACA 4-digit coordinate generation and properties."""
import numpy as np
import pytest

from backend.airfoil import naca_4_digit_coordinates, get_airfoil_properties


class TestNACACoordinates:
    @pytest.mark.parametrize("code", ["0012", "2412", "4412", "0015", "2415", "4415"])
    def test_returns_correct_shape(self, code):
        coords = naca_4_digit_coordinates(code, n=150)
        assert coords.ndim == 2
        assert coords.shape[1] == 2
        assert coords.shape[0] > 0

    def test_x_range_is_normalized(self):
        coords = naca_4_digit_coordinates("2412")
        x = coords[:, 0]
        assert x.min() >= -0.01
        assert x.max() <= 1.01

    def test_symmetric_airfoil_has_symmetric_surfaces(self):
        coords = naca_4_digit_coordinates("0012", n=150)
        n_half = len(coords) // 2
        upper = coords[:n_half]
        lower = coords[n_half:][::-1]
        np.testing.assert_allclose(upper[:, 1], -lower[:, 1], atol=1e-6)

    def test_cambered_airfoil_has_positive_camber(self):
        coords = naca_4_digit_coordinates("4412", n=150)
        n_half = len(coords) // 2
        y_upper = coords[:n_half, 1]
        assert y_upper.max() > 0.04

    def test_thickness_matches_naca_code(self):
        coords = naca_4_digit_coordinates("0012", n=200)
        n_half = len(coords) // 2
        upper = coords[:n_half, 1]
        lower = coords[n_half:][::-1, 1]
        max_thickness = (upper - lower).max()
        assert 0.10 < max_thickness < 0.13

    def test_leading_edge_at_origin(self):
        coords = naca_4_digit_coordinates("2412")
        x_min = coords[:, 0].min()
        assert abs(x_min) < 0.05

    def test_trailing_edge_near_one(self):
        coords = naca_4_digit_coordinates("2412")
        x_max = coords[:, 0].max()
        assert 0.95 < x_max <= 1.01

    def test_n_parameter_changes_resolution(self):
        coords_low = naca_4_digit_coordinates("2412", n=50)
        coords_high = naca_4_digit_coordinates("2412", n=200)
        assert len(coords_high) > len(coords_low)


class TestAirfoilProperties:
    def test_symmetric_airfoil_zero_camber(self):
        props = get_airfoil_properties("0012")
        assert props["max_camber"] == 0
        assert props["camber_position"] == 0

    def test_cambered_airfoil_nonzero_camber(self):
        props = get_airfoil_properties("4412")
        assert props["max_camber"] == pytest.approx(0.04)
        assert props["camber_position"] == pytest.approx(0.4)

    def test_thickness_extracted_correctly(self):
        assert get_airfoil_properties("0012")["max_thickness"] == pytest.approx(0.12)
        assert get_airfoil_properties("2415")["max_thickness"] == pytest.approx(0.15)

    def test_cl_alpha_is_2pi(self):
        props = get_airfoil_properties("2412")
        assert props["cl_alpha"] == pytest.approx(2 * np.pi)

    def test_cambered_airfoil_higher_cl_max(self):
        sym = get_airfoil_properties("0012")
        cambered = get_airfoil_properties("4412")
        assert cambered["cl_max"] > sym["cl_max"]

    def test_thicker_airfoil_higher_cd0(self):
        thin = get_airfoil_properties("0012")
        thick = get_airfoil_properties("0015")
        assert thick["cd_0"] > thin["cd_0"]

    @pytest.mark.parametrize("code", ["0012", "2412", "4412", "2415", "0015", "4415"])
    def test_all_required_keys_present(self, code):
        props = get_airfoil_properties(code)
        required = {"max_camber", "camber_position", "max_thickness",
                    "cl_alpha", "cl_max", "alpha_stall", "cm_0", "cd_0"}
        assert required.issubset(props.keys())

    def test_stall_angle_within_reasonable_range(self):
        for code in ["0012", "2412", "4412"]:
            props = get_airfoil_properties(code)
            assert 10 <= props["alpha_stall"] <= 20

    def test_symmetric_airfoil_zero_alpha_l0(self):
        props = get_airfoil_properties("0012")
        assert abs(props["alpha_L0"]) < 0.5

    def test_cambered_airfoil_negative_alpha_l0(self):
        for code in ["2412", "4412", "6412"]:
            props = get_airfoil_properties(code)
            assert props["alpha_L0"] < -1.0, f"NACA {code} should have negative alpha_L0"

    @pytest.mark.parametrize("code,expected", [
        ("0012", 0.0),
        ("2412", -2.0),
        ("4412", -4.0),
    ])
    def test_alpha_l0_matches_abbott(self, code, expected):
        props = get_airfoil_properties(code)
        assert props["alpha_L0"] == pytest.approx(expected, abs=0.3)

    def test_cm_0_symmetric_airfoil_is_zero(self):
        assert abs(get_airfoil_properties("0012")["cm_0"]) < 0.001

    def test_cm_0_cambered_is_negative(self):
        for code in ["2412", "4412"]:
            assert get_airfoil_properties(code)["cm_0"] < -0.02

    def test_cl_max_within_5pct_of_reference(self):
        ref = {"0012": 1.45, "2412": 1.55, "4412": 1.65, "0015": 1.40}
        for code, target in ref.items():
            props = get_airfoil_properties(code)
            assert abs(props["cl_max"] - target) / target < 0.10, \
                f"NACA {code} cl_max off: {props['cl_max']} vs {target}"

    def test_cd_0_within_20pct_of_reference(self):
        ref = {"0012": 0.006, "2412": 0.0065, "4412": 0.0075, "0015": 0.0075}
        for code, target in ref.items():
            props = get_airfoil_properties(code)
            assert abs(props["cd_0"] - target) / target < 0.20, \
                f"NACA {code} cd_0 off: {props['cd_0']} vs {target}"

    def test_thicker_airfoil_lower_cl_max(self):
        thin = get_airfoil_properties("0012")
        thick = get_airfoil_properties("0015")
        assert thick["cl_max"] <= thin["cl_max"] + 0.05

    def test_alpha_l0_key_present(self):
        props = get_airfoil_properties("2412")
        assert "alpha_L0" in props
