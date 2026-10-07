"""Reject non-finite, missing and nonphysical inputs before model evaluation."""
import math

class InputError(ValueError):
    pass

def number(data,key,low,high,required=False):
    value=data.get(key)
    if value is None:
        if required:raise InputError(f"Eksik ölçü: {key}. Önce modeli hesaplayın.")
        return
    try:
        if isinstance(value,bool):raise ValueError()
        value=float(value)
    except (ValueError,TypeError):raise InputError(f"{key}: geçerli bir sayı girin.")
    if not math.isfinite(value) or not low<=value<=high:
        raise InputError(f"{key}: {low:g}–{high:g} aralığında sonlu bir değer girin.")
    data[key]=value

def validate_request(data,endpoint):
    if not isinstance(data,dict):raise InputError("Parametreler okunamadı. Formu kontrol edin.")
    for key,lo,hi in [('wingspan',.1,100),('weight',.01,10000),('reynolds_number',10000,5000000),
                       ('max_alpha',1,40),('cg_percent',0,100),('motor_power',0,1000000),
                       ('battery_wh',0,1000000),('prop_efficiency',.01,1),('avionics_power',0,100000),('n_limit',1,12)]:
        number(data,key,lo,hi)
    for key in list(data):
        if key.startswith('man_'):
            number(data,key,-45 if 'sweep' in key or 'dihedral' in key else .001,60 if 'sweep' in key or 'dihedral' in key else 100)
    enums={'wing_position':['low','mid','high'],'tail_type':['conventional','ttail','vtail'],
           'wing_shape':['rectangular','tapered','ste_tapered'],'fuse_type':['conventional','manual'],'airframe':['standard','combat']}
    for key,choices in enums.items():
        if key in data and data[key] not in choices:raise InputError(f"Geçersiz seçim: {key}.")
    if endpoint!='api_calculate':
        g=data.get('geometry')
        if not isinstance(g,dict):raise InputError("Önce uçak ölçülerini hesaplayın.")
        for key in ['weight','wing_area','aspect_ratio','mac','wingspan','root_chord','tip_chord']:
            number(g,key,.000001,1000000,True)
        for key in ['htail_area','htail_span','htail_arm','vtail_span']:
            number(g,key,.000001,1000000,endpoint=='api_stability')
        for key in ['cg_position','taper_ratio_input']:
            number(g,key,0,1000000,endpoint=='api_analyze')
        for key in ['sweep_angle','effective_tail_arm']:
            number(g,key,-1000,1000)
    targets=data.get('targets')
    if targets is not None:
        if not isinstance(targets,dict):raise InputError("Görev hedeflerini kontrol edin.")
        for key in ['endurance_min','turn_rate_deg','stall_speed']:number(targets,key,.001,100000)
