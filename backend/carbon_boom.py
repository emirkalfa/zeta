"""Purchased carbon tail tube, blind body socket and split printable tail carrier."""
import math
import numpy as np
from backend.manufacturing import number, cylinder, box, ManufacturingError


def prepare_carbon_boom(body,outer,data,assemblies,frames,cuts):
    g=data['geometry'];o=data['options'];gap=number(o,'clearance',.3,.1,.8)
    diameter=number(o,'vtolBoomDiameter',20,12,40)
    inner=number(o,'vtolBoomInnerDiameter',16,8,38)
    if inner>=diameter-1:
        raise ManufacturingError('Karbon boru: iç çap dış çaptan en az 1 mm küçük olmalı.')
    insertion=number(o,'vtolBoomInsertion',60,40,100)
    end=g['fuselage_length']*1000*.56
    start=end-insertion
    tail_specs=[p for p in data['panels'] if p['kind']=='tail' and p.get('parent','body')=='body']
    cx=max((p['root'][0]+p['chord']*.4)*1000 for p in tail_specs)
    carrier_start=cx-45;carrier_end=cx+50
    r=diameter/2
    bore=cylinder(r+gap/2,carrier_end-start+4,[start,0,0],[1,0,0])
    def socket(name,a,b):
        solid=cylinder(r+6,b-a,[a,0,0],[1,0,0])-bore
        # Split collar with two external bolts: no drilling through carbon fibres.
        solid-=box([b-35,-gap/2,r-1],[b+1,gap/2,r+20])
        solid+=box([b-35,gap/2,r+2],[b,7,r+16])
        solid+=box([b-35,-7,r+2],[b,-gap/2,r+16])
        points=[]
        for xx in [b-27,b-9]:
            drill=cylinder((3+gap)/2,18,[xx,-9,r+10],[0,1,0])
            nut=cylinder((5.5+gap)/math.sqrt(3),2.7,[xx,-7,r+10],[0,1,0],sides=6)
            solid=solid-drill-nut
            cuts.setdefault(name,[]).extend([drill,nut,bore])
            points.append([xx,7,r+10])
        return solid,points
    neck,body_bolts=socket('body',start-3,end+15)
    neck-=bore
    # A bulkhead spreads the neck load into the original body shell.
    bulk=(outer^box([end-20,-10000,-10000],[end-14,10000,10000]))-bore
    end_cap=(outer^box([end-2,-10000,-10000],[end,10000,10000]))-bore
    body=(body^box([-10000,-10000,-10000],[end,10000,10000]))+neck+bulk+end_cap
    wire=cylinder(3,insertion+22,[start-4,0,0],[1,0,0])
    body-=wire;cuts['body'].append(wire)
    carrier,tail_bolts=socket('vtol_tail_carrier',carrier_start,carrier_end)
    assemblies['vtol_tail_carrier']=carrier
    frames['vtol_tail_carrier']=(np.column_stack([np.eye(3),[0,0,0]]),0,'tail')
    for p in tail_specs:p['parent']='vtol_tail_carrier'
    tube={'part':'carbon_tail_tube','purchased':True,'outer_diameter_mm':diameter,'inner_diameter_mm':inner,
          'start_mm':[start,0,0],'end_mm':[carrier_end-2,0,0],'length_mm':carrier_end-2-start,
          'body_end_mm':end,'body_insertion_mm':insertion,'body_bolt_points_mm':body_bolts,
          'tail_carrier':'vtol_tail_carrier','tail_bolt_points_mm':tail_bolts,'socket_bore_mm':diameter+gap}
    data['carbon_boom']=tube
    return body,tube
