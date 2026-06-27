"""Tests for backend/geometry.py - auto and manual aircraft geometry."""
import numpy as np
import pytest

from backend.geometry import (
    calculate_geometry,
    calculate_control_surfaces,
    generate_wing_mesh_data,
    generate_conventional_fuselage_mesh_data,
    generate_tail_mesh_data,
)
from backend.airfoil import naca_4_digit_coordinates


REQUIRED_KEYS = {
    "wingspan", "weight", "airfoil", "root_chord", "tip_chord", "taper_ratio",
    "wing_area", "aspect_ratio", "mac", "mac_y", "sweep_angle", "dihedral_angle",
    "fuselage_length", "fuselage_max_width", "fuselage_max_height",
    "htail_span", "htail_chord", "htail_area", "htail_arm",
    "vtail_span", "vtail_chord", "vtail_area",
    "cg_position", "wing_position", "tail_type",
    "manual_mode", "wing_shape",
}


class TestAutoMode:
    def test_all_required_keys_present(self, default_geom):
        assert REQUIRED_KEYS.issubset(default_geom.keys())

    def test_default_wingspan_and_weight_round_trip(self, default_geom):
        assert default_geom["wingspan"] == 1.5
        assert default_geom["weight"] == 2.5

    def test_aspect_ratio_default_is_7(self, default_geom):
        assert default_geom["aspect_ratio"] == pytest.approx(7.0, rel=1e-3)

    def test_wing_area_formula(self, default_geom):
        b = default_geom["wingspan"]
        ar = default_geom["aspect_ratio"]
        assert default_geom["wing_area"] == pytest.approx(b ** 2 / ar, rel=1e-2)

    def test_tip_chord_smaller_than_root(self, default_geom):
        assert default_geom["tip_chord"] < default_geom["root_chord"]

    def test_taper_ratio_matches_chord_ratio(self, default_geom):
        ratio = default_geom["tip_chord"] / default_geom["root_chord"]
        assert ratio == pytest.approx(default_geom["taper_ratio"], rel=1e-2)

    def test_mac_between_tip_and_root(self, default_geom):
        assert default_geom["tip_chord"] <= default_geom["mac"] <= default_geom["root_chord"]

    def test_fuselage_length_proportional_to_wingspan(self, default_geom):
        assert default_geom["fuselage_length"] == pytest.approx(0.80 * default_geom["wingspan"], rel=1e-2)

    def test_tail_arm_positive(self, default_geom):
        assert default_geom["htail_arm"] > 0

    def test_htail_smaller_than_main_wing(self, default_geom):
        assert default_geom["htail_area"] < default_geom["wing_area"]
        assert default_geom["htail_span"] < default_geom["wingspan"]

    def test_vtail_smaller_than_htail(self, default_geom):
        assert default_geom["vtail_area"] < default_geom["htail_area"]


class TestWingShape:
    def test_rectangular_has_taper_one(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="rectangular")
        assert g["taper_ratio"] == pytest.approx(1.0)
        assert g["root_chord"] == pytest.approx(g["tip_chord"])

    def test_rectangular_has_zero_sweep(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="rectangular")
        assert g["sweep_angle"] == 0.0

    def test_tapered_has_partial_taper(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="tapered")
        assert 0.0 < g["taper_ratio"] < 1.0


class TestScaling:
    @pytest.mark.parametrize("wingspan", [0.3, 1.0, 1.5, 3.0, 5.0, 10.0])
    def test_all_outputs_positive(self, wingspan):
        g = calculate_geometry(wingspan, 2.5, "2412")
        for key in ("root_chord", "tip_chord", "mac", "wing_area",
                    "fuselage_length", "htail_span", "vtail_span"):
            assert g[key] > 0, f"{key} should be positive at wingspan={wingspan}"

    @pytest.mark.parametrize("wingspan", [0.5, 1.5, 3.0, 10.0])
    def test_geometry_scales_linearly_with_wingspan(self, wingspan):
        g1 = calculate_geometry(1.5, 2.5, "2412")
        g2 = calculate_geometry(wingspan, 2.5, "2412")
        ratio = wingspan / 1.5
        assert g2["root_chord"] == pytest.approx(g1["root_chord"] * ratio, rel=1e-2)
        assert g2["fuselage_length"] == pytest.approx(g1["fuselage_length"] * ratio, rel=1e-2)
        assert g2["wing_area"] == pytest.approx(g1["wing_area"] * ratio ** 2, rel=1e-2)


class TestManualMode:
    def test_manual_uses_supplied_chords(self):
        g = calculate_geometry(
            1.5, 2.5, "2412",
            manual_mode=True,
            man_root_chord=0.30, man_tip_chord=0.10,
            man_sweep=10, man_dihedral=5,
            man_htail_span=0.5, man_htail_root=0.15, man_htail_tip=0.08,
            man_htail_sweep=4,
            man_vtail_span=0.3, man_vtail_root=0.15, man_vtail_tip=0.05,
        )
        assert g["root_chord"] == pytest.approx(0.30)
        assert g["tip_chord"] == pytest.approx(0.10)
        assert g["sweep_angle"] == pytest.approx(10.0)
        assert g["dihedral_angle"] == pytest.approx(5.0)
        assert g["htail_span"] == pytest.approx(0.5)
        assert g["vtail_span"] == pytest.approx(0.3)

    def test_manual_taper_derived_from_chords(self):
        g = calculate_geometry(
            1.5, 2.5, "2412",
            manual_mode=True,
            man_root_chord=0.20, man_tip_chord=0.10,
        )
        assert g["taper_ratio"] == pytest.approx(0.5)

    def test_manual_mode_flag_propagated(self, default_geom):
        assert default_geom["manual_mode"] is False
        g = calculate_geometry(1.5, 2.5, "2412", manual_mode=True,
                               man_root_chord=0.2, man_tip_chord=0.1)
        assert g["manual_mode"] is True


class TestStraightTrailingEdge:
    def test_ste_taper_ratio(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        assert g["taper_ratio"] == pytest.approx(0.5)

    def test_ste_straight_te_flag(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        assert g["straight_te"] is True
        g2 = calculate_geometry(1.5, 2.5, "2412", wing_shape="tapered")
        assert g2["straight_te"] is False

    def test_ste_sweep_angle_positive(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        assert g["sweep_angle"] > 0

    def test_ste_mesh_straight_te(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        coords = [{"x": x, "y_upper": y, "y_lower": -y}
                  for x, y in naca_4_digit_coordinates("2412")]
        m = generate_wing_mesh_data(g, coords, n_sections=10)
        te_x_positions = []
        for sec in m["right"]:
            upper = sec["upper"]
            te_x = upper[:, 0].max()
            te_x_positions.append(te_x)
        std_te = np.std(te_x_positions)
        assert std_te < 1e-5, f"TE x std={std_te} should be near zero for straight TE"

    def test_ste_mesh_te_scatter_smaller_than_tapered(self):
        g_ste = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        g_tap = calculate_geometry(1.5, 2.5, "2412", wing_shape="tapered")
        coords = [{"x": x, "y_upper": y, "y_lower": -y}
                  for x, y in naca_4_digit_coordinates("2412")]
        m_ste = generate_wing_mesh_data(g_ste, coords, n_sections=10)
        m_tap = generate_wing_mesh_data(g_tap, coords, n_sections=10)
        def te_std(m):
            te_x = [sec["upper"][:, 0].max() for sec in m["right"]]
            return np.std(te_x)
        assert te_std(m_ste) < te_std(m_tap) / 10

    def test_ste_wing_area_matches_formula(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        b = g["wingspan"]
        ar = g["aspect_ratio"]
        assert g["wing_area"] == pytest.approx(b ** 2 / ar, rel=1e-2)

    @pytest.mark.parametrize("wingspan", [0.5, 1.5, 3.0, 10.0])
    def test_ste_scales_with_wingspan(self, wingspan):
        g = calculate_geometry(wingspan, 2.5, "2412", wing_shape="ste_tapered")
        assert g["root_chord"] > 0
        assert g["tip_chord"] > 0
        assert g["wing_area"] > 0

    def test_ste_wing_shape_passthrough(self):
        g = calculate_geometry(1.5, 2.5, "2412", wing_shape="ste_tapered")
        assert g["wing_shape"] == "ste_tapered"


class TestControlSurfaces:
    def test_cs_keys_in_geometry(self, default_geom):
        assert 'control_surfaces' in default_geom
        cs = default_geom['control_surfaces']
        for k in ('aileron', 'flap', 'elevator', 'rudder'):
            assert k in cs

    def test_aileron_eta_order(self):
        cs = calculate_control_surfaces(1.5, 0.321, 0.286, 0.5, 0.063, 0.027, 'tapered')
        assert cs['aileron']['eta_start'] < cs['aileron']['eta_end']

    def test_flap_eta_order(self):
        cs = calculate_control_surfaces(1.5, 0.321, 0.286, 0.5, 0.063, 0.027, 'tapered')
        assert cs['flap']['eta_start'] < cs['flap']['eta_end']

    def test_aileron_flap_no_overlap(self):
        cs = calculate_control_surfaces(1.5, 0.321, 0.286, 0.5, 0.063, 0.027, 'tapered')
        assert cs['aileron']['eta_start'] >= cs['flap']['eta_end']

    def test_cs_areas_positive(self):
        cs = calculate_control_surfaces(1.5, 0.321, 0.286, 0.5, 0.063, 0.027, 'tapered')
        assert cs['aileron']['area'] > 0
        assert cs['flap']['area'] > 0
        assert cs['elevator']['area'] > 0
        assert cs['rudder']['area'] > 0

    def test_cs_all_wing_shapes(self):
        for shape in ('tapered', 'rectangular', 'ste_tapered'):
            g = calculate_geometry(1.5, 2.5, '2412', wing_shape=shape)
            cs = g['control_surfaces']
            assert cs['aileron']['area'] > 0
            assert cs['flap']['area'] > 0

    def test_cs_area_reasonable(self):
        g = calculate_geometry(1.5, 2.5, '2412')
        cs = g['control_surfaces']
        wing_area = g['wing_area']
        total_cs_area = cs['aileron']['area'] + cs['flap']['area']
        assert total_cs_area < wing_area
        assert total_cs_area > wing_area * 0.05


class TestConfigPassthrough:
    @pytest.mark.parametrize("pos", ["low", "mid", "high"])
    def test_wing_position(self, pos):
        g = calculate_geometry(1.5, 2.5, "2412", wing_position=pos)
        assert g["wing_position"] == pos

    @pytest.mark.parametrize("tail", ["conventional", "ttail", "vtail"])
    def test_tail_type(self, tail):
        g = calculate_geometry(1.5, 2.5, "2412", tail_type=tail)
        assert g["tail_type"] == tail

    def test_wing_position_offset_signs(self):
        low = calculate_geometry(1.5, 2.5, "2412", wing_position="low")
        mid = calculate_geometry(1.5, 2.5, "2412", wing_position="mid")
        high = calculate_geometry(1.5, 2.5, "2412", wing_position="high")
        assert low["wing_position_offset"] < 0
        assert mid["wing_position_offset"] == 0
        assert high["wing_position_offset"] > 0


class TestMeshGeneration:
    def test_wing_mesh_returns_right_and_left(self, default_geom):
        coords = [{"x": x, "y_upper": y, "y_lower": -y}
                  for x, y in naca_4_digit_coordinates("2412")]
        m = generate_wing_mesh_data(default_geom, coords, n_sections=10)
        assert "right" in m and "left" in m
        assert len(m["right"]) == 11
        assert len(m["left"]) == 11

    def test_wing_mesh_left_is_mirror_of_right(self, default_geom):
        coords = [{"x": x, "y_upper": y, "y_lower": -y}
                  for x, y in naca_4_digit_coordinates("2412")]
        m = generate_wing_mesh_data(default_geom, coords, n_sections=5)
        r0 = m["right"][3]["upper"]
        l0 = m["left"][3]["upper"]
        assert (r0[:, 2] == -l0[:, 2]).all()

    def test_conventional_fuselage_has_sections(self, default_geom):
        m = generate_conventional_fuselage_mesh_data(default_geom)
        assert len(m["sections"]) == m["n_spanwise"]

    def test_tail_mesh_has_horizontal_and_vertical(self, default_geom):
        coords = [{"x": x, "y_upper": y, "y_lower": -y}
                  for x, y in naca_4_digit_coordinates("0012")]
        m = generate_tail_mesh_data(default_geom, coords, n_sections=8)
        assert "horizontal" in m and "vertical" in m
        assert "right" in m["horizontal"] and "left" in m["horizontal"]
        assert len(m["vertical"]) == 9
