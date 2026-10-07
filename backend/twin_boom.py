"""Printable twin boom tubes, pinned wing sockets and removable tail bridge."""
import math
import numpy as np
from backend.manufacturing import box,cylinder,ManufacturingError

def prepare_booms(g,assemblies,frames,cuts,wall,gap,screw,nf,nh):
    b=g['tail_booms'];r=float(b['diameter'])*500
    if r<wall+3:raise ManufacturingError('Kuyruk bomu iç bağlantı için çok ince.')
    x0=float(b['x_start'])*1000;x1=float(b['x_end'])*1000
    by=float(b['y'])*1000;y=(float(g.get('wing_position_offset',0))+float(b['y'])*math.sin(math.radians(g['dihedral_angle'])))*1000
    identity=np.column_stack([np.eye(3),[0,0,0]])
    report=[]
    for sign,side in [(1,'right'),(-1,'left')]:
        name='boom_'+side;z=sign*by
        assemblies[name]=cylinder(r,x1-x0,[x0,y,z],[1,0,0])-cylinder(r-wall,x1-x0+2,[x0-1,y,z],[1,0,0])
        frames[name]=(identity,0,'tail');cuts[name]=[]
        report.append({'part':name,'parent':'wing_'+side,'center_mm':[x0,y,z],'end_x_mm':x1,
                       'outer_diameter_mm':2*r,'wall_mm':wall,'socket_length_mm':25,
                       'bolt_point_mm':[x0+12,y,z],'bolt_axis':[0,1,0],
                       'screw_diameter_mm':screw,'nut_flat_mm':nf,'segment_spigot_mm':12})
    if g['tail_type']=='conventional':
        x=(float(g['tail_x_pos'])+float(g['htail_chord'])*.4)*1000
        bridge=box([x-5,y-r-5,-by],[x+5,y-r-1,by])
        bridge=bridge+box([x-22,y-r-4,-22],[x+22,y+6,22])
        for sign in [1,-1]:
            z=sign*by
            collar=cylinder(r+3,16,[x-8,y,z],[1,0,0])-cylinder(r+gap/2,18,[x-9,y,z],[1,0,0])
            drill=cylinder((screw+gap)/2,2*r+12,[x,y-r-6,z],[0,1,0])
            nut=cylinder((nf+gap)/math.sqrt(3),nh+gap,[x,y-r-3-.01,z],[0,1,0],sides=6)
            bridge=(bridge+collar)-drill-nut
            name='boom_'+('right' if sign>0 else 'left')
            cuts[name].append(drill)
        assemblies['tail_bridge']=bridge;frames['tail_bridge']=(identity,0,'tail')
    return report

def install_boom_sockets(assemblies,cuts,report,gap,screw,nf,nh):
    for b in report:
        x,y,z=b['center_mm'];r=b['outer_diameter_mm']/2;parent=b['parent'];name=b['part']
        sleeve=cylinder(r+3,28,[x-3,y,z],[1,0,0])
        hole=cylinder(r+gap/2,b['end_x_mm']-x+5,[x-.1,y,z],[1,0,0])
        drill=cylinder((screw+gap)/2,2*r+14,[x+12,y-r-7,z],[0,1,0])
        nut=cylinder((nf+gap)/math.sqrt(3),nh+gap,[x+12,y-r-3-.01,z],[0,1,0],sides=6)
        if (sleeve^assemblies[parent]).volume()<1:raise ManufacturingError('Bom bağlantısı kanada ulaşmıyor; kanat/bom ölçülerini kontrol edin.')
        assemblies[parent]=(assemblies[parent]+sleeve)-hole-drill-nut
        cuts.setdefault(parent,[]).extend([hole,drill,nut])
        cuts[name].append(drill)
