"""Printable twin boom tubes, pinned wing sockets and removable tail bridge."""
import math
import numpy as np
from backend.manufacturing import box,cylinder,mesh_solid,ManufacturingError

def vtail_end_fairing(g,x,y,z,radius,wall):
    """Tangent round-to-taper transition, with a closed printable aft end."""
    start=x-.5
    end=max(x+max(8,wall*3),(float(g['tail_x_pos'])+float(g['vtail_chord']))*1000)
    positions=np.linspace(start,end,33)
    u=(positions-start)/(end-start)
    radii=wall+(radius-wall)*(1-3*u*u+2*u*u*u)
    angles=np.arange(48)*2*math.pi/48
    def rings(xs,rs):
        return np.array([np.column_stack([np.full(48,xx),y+rr*np.sin(angles),z-rr*np.cos(angles)]) for xx,rr in zip(xs,rs)])
    outer=rings(positions,radii)
    valid=radii>wall+.25
    inner_x=positions[valid].copy();inner_x[0]-=.1
    inner=rings(inner_x,radii[valid]-wall)
    skin=mesh_solid(outer,outer[0][:,[1,2]])-mesh_solid(inner,inner[0][:,[1,2]])
    return skin,{'start_x_mm':start,'end_x_mm':end,'start_radius_mm':radius,
                 'end_radius_mm':wall,'wall_mm':wall,'closed_aft_end':True}

def prepare_booms(g,assemblies,frames,cuts,wall,gap,screw,nf,nh):
    b=g['tail_booms'];r=float(b['diameter'])*500
    if r<wall+3:raise ManufacturingError('Kuyruk bomu iç bağlantı için çok ince.')
    x0=float(b['x_start'])*1000;x1=float(b['x_end'])*1000
    by=float(b['y'])*1000;y=(float(g.get('wing_position_offset',0))+float(b['y'])*math.sin(math.radians(g['dihedral_angle'])))*1000
    identity=np.column_stack([np.eye(3),[0,0,0]])
    report=[]
    for sign,side in [(1,'right'),(-1,'left')]:
        name='boom_'+side;z=sign*by
        tube=cylinder(r,x1-x0,[x0,y,z],[1,0,0])-cylinder(r-wall,x1-x0+2,[x0-1,y,z],[1,0,0])
        fairing=None
        if g['tail_type']=='vtail':
            transition,fairing=vtail_end_fairing(g,x1,y,z,r,wall)
            tube=tube+transition
        assemblies[name]=tube
        frames[name]=(identity,0,'tail');cuts[name]=[]
        report.append({'part':name,'parent':'wing_'+side,'center_mm':[x0,y,z],'end_x_mm':x1,
                       'outer_diameter_mm':2*r,'wall_mm':wall,'socket_length_mm':25,
                       'bolt_point_mm':[x0+12,y,z],'bolt_axis':[0,1,0],
                       'screw_diameter_mm':screw,'nut_flat_mm':nf,'segment_spigot_mm':12,'tail_fairing':fairing})
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
