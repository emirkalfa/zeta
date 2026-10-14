"""Penta conceptual pod layout, not a certification or universal aircraft ratio."""

def penta_layout(span,root_chord,motor_diameter=28,clearance=.078):
    width=max(.10*span,.30*root_chord,(motor_diameter+20)/1000,.09)
    height=max(.065*span,.22*root_chord,(motor_diameter+16)/1000,.075)
    length=max(.38*span,1.6*root_chord+.08,4*width,.30)
    wing=.35*length
    tail=max(wing+.50*span,length+clearance)
    return dict(length=round(length,3),width=round(width,3),height=round(height,3),
                wing=round(wing,3),tail=round(tail,3))
