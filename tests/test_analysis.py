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

    def test_cambered_airfoil_has_positive_cl_at_zero_alpha(self, default_geom, airfoil_props_2412):
        p = calculate_polars(default_geom, airfoil_props_2412)
        at_zero = next(pt for pt in p["cl_vs_alpha"] if pt["x"] == 0.0)
        assert at_zero["y"] > 0.1, f"NACA 2412 should have CL>0.1 at alpha=0, got {at_zero['y']}"

    def test_3d_cl_alpha_matches_prandtl_within_10pct(self, default_geom, airfoil_props_2412):
        import numpy as np
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        r0 = next(r for r in results if r["alpha"] == 0.0)
        r2 = next(r for r in results if r["alpha"] == 2.0)
        slope = (r2["CL"] - r0["CL"]) / 2.0
        AR = default_geom["aspect_ratio"]
        prandtl = (2 * np.pi) / (1 + 2 / AR) / 57.2958
        assert abs(slope - prandtl) / prandtl < 0.10, \
            f"CL_alpha 3D off: {slope:.4f} vs Prandtl {prandtl:.4f}"

    def test_lift_distribution_has_positive_cambered_lift(self, default_geom, airfoil_props_4412):
        """NACA 4412 at α=5° should have non-trivial positive cl_local across mid-span."""
        results = lifting_line_analysis(default_geom, airfoil_props_4412)
        r5 = next(r for r in results if r["alpha"] == 5.0)
        cls = [pt["cl_local"] for pt in r5["lift_distribution"]]
        # Lifting-line gives zero cl at tips (y=±b/2, vortex trails off).
        # At mid-span, cl should be substantial and positive.
        mid_idx = len(cls) // 2
        assert cls[mid_idx] > 0.3, f"cl at mid-span too low: {cls[mid_idx]}"

    def test_cambered_wing_lifts_more_than_symmetric(self, default_geom, airfoil_props_2412, airfoil_props_0012):
        r_cambered = lifting_line_analysis(default_geom, airfoil_props_2412)
        r_symmetric = lifting_line_analysis(default_geom, airfoil_props_0012)
        c5 = next(r for r in r_cambered if r["alpha"] == 5.0)
        s5 = next(r for r in r_symmetric if r["alpha"] == 5.0)
        assert c5["CL"] > s5["CL"], \
            f"Cambered wing should produce more lift: {c5['CL']} vs {s5['CL']}"

    def test_cd_increases_with_alpha(self, default_geom, airfoil_props_2412):
        results = lifting_line_analysis(default_geom, airfoil_props_2412)
        linear = [r for r in results if 0 <= r["alpha"] <= 8]
        cds = [r["CD"] for r in linear]
        assert cds == sorted(cds), "CD should increase with alpha in linear regime"
