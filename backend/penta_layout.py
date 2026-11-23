"""Penta conceptual pod layout, not a certification or universal aircraft ratio."""

def penta_layout(span,root_chord,motor_diameter=28,clearance=.078,*,wing_shape=None):
    cabin_chord = (span / (6 if wing_shape == 'rectangular' else 4.5)
                   if wing_shape is not None else root_chord)
    cabin_span = (1.5 * span)**.5 if wing_shape is not None and span > 1.5 else span
    wing_width = .30*root_chord if wing_shape is None else 0.
    wing_height = .22*root_chord if wing_shape is None else 0.
    width=max(.10*cabin_span,wing_width,(motor_diameter+20)/1000,.09)
    height=max(.065*cabin_span,wing_height,(motor_diameter+16)/1000,.075)
    length=max(.38*span,1.6*cabin_chord+.08,4*width,.30)
    wing=.35*length
    tail=max(wing+.50*span,length+clearance)
    return dict(length=round(length,3),width=round(width,3),height=round(height,3),
                wing=round(wing,3),tail=round(tail,3))
