"""Tests for backend/analysis.py - lifting line theory and polar curves."""
import pytest

from backend.analysis import lifting_line_analysis, calculate_polars


class TestLiftingLine:
    def test_returns_alpha_sweep(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        assert len(results) == 51
        assert results[0]["alpha"] == pytest.approx(-5.0)
        assert results[-1]["alpha"] == pytest.approx(20.0)

    def test_each_result_has_expected_keys(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        required = {"alpha", "CL", "CD", "Cm", "CL_CD", "CL_2d", "lift_distribution"}
        for r in results:
            assert required.issubset(r.keys())

    def test_cl_increases_with_alpha_in_linear_region(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        linear = [r for r in results if -2 <= r["alpha"] <= 8]
        cls = [r["CL"] for r in linear]
        assert cls == sorted(cls), "CL should increase monotonically in linear regime"

    def test_cl_clipped_to_cl_max(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        cl_max = airfoil_props_2412["cl_max"]
        for r in results:
            assert abs(r["CL"]) <= cl_max + 1e-6

    def test_cd_always_positive(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        for r in results:
            assert r["CD"] > 0

    def test_lift_distribution_spans_full_wingspan(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        b = default_geom["wingspan"]
        for r in results:
            ys = [pt["y"] for pt in r["lift_distribution"]]
            assert min(ys) == pytest.approx(-b / 2, abs=0.05)
            assert max(ys) == pytest.approx(b / 2, abs=0.05)

    def test_chord_distribution_matches_geometry(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        chords = [pt["chord"] for pt in results[0]["lift_distribution"]]
        root_c = default_geom["root_chord"]
        tip_c = default_geom["tip_chord"]
        assert max(chords) == pytest.approx(root_c, rel=0.05)
        assert min(chords) == pytest.approx(tip_c, rel=0.10)


class TestPolars:
    def test_polars_has_all_charts(self, default_geom, airfoil_props_2412):
        p = calculate_polars(default_geom, airfoil_props_2412)
        for key in ("cl_vs_alpha", "cd_vs_cl", "cm_vs_alpha", "efficiency", "lift_distribution"):
            assert key in p

    def test_polars_chart_points_have_x_y(self, default_geom, airfoil_props_2412):
        p = calculate_polars(default_geom, airfoil_props_2412)
        for pt in p["cl_vs_alpha"]:
            assert "x" in pt and "y" in pt

    def test_polars_lift_distribution_not_empty(self, default_geom, airfoil_props_2412):
        p = calculate_polars(default_geom, airfoil_props_2412)
        assert len(p["lift_distribution"]) > 0

    def test_polars_consistent_length(self, default_geom, airfoil_props_2412):
        p = calculate_polars(default_geom, airfoil_props_2412)
        n = len(p["cl_vs_alpha"])
        assert len(p["cd_vs_cl"]) == n
        assert len(p["cm_vs_alpha"]) == n
        assert len(p["efficiency"]) == n

    def test_symmetric_airfoil_has_zero_cl_at_zero_alpha(self, default_geom, airfoil_props_0012):
        p = calculate_polars(default_geom, airfoil_props_0012)
        at_zero = next(pt for pt in p["cl_vs_alpha"] if pt["x"] == 0.0)
        assert abs(at_zero["y"]) < 0.05
