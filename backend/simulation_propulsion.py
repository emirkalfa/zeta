"""Visible motor and two-blade propeller solids, in assembly millimetres."""
import numpy as np
import manifold3d as md
from backend.manufacturing import cylinder


def propulsion(motors):
    return [casing + rotor for casing, rotor, _, _ in map(propulsion_components, motors)]


def propulsion_components(motor):
    face=np.asarray(motor['face_mm'],dtype=float)
    axis=np.asarray(motor['out_axis'] if 'out_axis' in motor else -np.asarray(motor['axis']),dtype=float)
    axis/=np.linalg.norm(axis)
    length=float(motor['motor_length_mm']);radius=float(motor['motor_diameter_mm'])/2
    center=np.asarray(motor.get('prop_center_mm',[motor.get('prop_plane_x_mm',face[0]),face[1],face[2]]),dtype=float)
    prop_radius=float(motor['prop_diameter_mm'])/2
    thickness=max(1.5,min(3.,prop_radius*.015))
    casing=cylinder(radius,length+.4,face-axis*.4,axis)
    shaft_length=float(np.dot(center-face,axis))+thickness
    shaft=cylinder(max(2.,radius*.15),shaft_length,face,axis)
    hub=cylinder(max(4.,radius*.35),thickness*2,center-axis*thickness,axis)
    across=np.cross([0,1,0] if abs(axis[1])<.9 else [0,0,1],axis)
    across/=np.linalg.norm(across);up=np.cross(axis,across)
    transform=np.column_stack([across,up,axis,center-axis*thickness/2])
    r=prop_radius;w=max(5.,r*.12)
    outline=[[0,-w*.2],[r*.65,-w*.55],[r*.98,-w*.18],[r,0],[r*.85,w*.4],[0,w*.2]]
    blade=md.CrossSection([outline]).extrude(thickness)
    blades=(blade+blade.rotate([0,0,180])).transform(transform.tolist())
    return casing, shaft+hub+blades, center, axis
