"""Canonical Tria and Penta bodies. Saved/custom sections cannot alter them."""
import math
import numpy as np

STATIONS=[
    (0,.045,.065,-.13),(.024,.35,.34,-.12),(.058,.64,.54,-.09),
    (.105,.82,.72,-.06),(.16,.96,.91,-.025),(.23,1.09,1.07,-.015),
    (.30,1.13,1.11,-.005),(.37,1.08,1.06,-.01),(.43,.93,.90,-.015),
    (.49,.70,.69,-.01),(.53,.55,.55,0),(.56,.42,.48,0),
    (.65,.23,.29,0),(.80,.17,.22,0),(1,.13,.18,0),
]

PENTA_STATIONS=[(0,.18,.22,0),(.08,.64,.63,.015),(.22,.93,.90,.025),(.38,1,1,.03),
                (.56,.92,.94,.025),(.72,.71,.76,.015),(.87,.50,.57,.005),(1,.36,.46,0)]


def tria_dimensions(wingspan):
    length=round(max(.96,.9+.2*wingspan) if wingspan<=4.2
                 else 1.74+1.68*(math.sqrt(wingspan/4.2)-1),3)
    scale=length/1.2
    return dict(length=length,width=.1921*scale,height=.1221*scale,
                wing=round(.30*length,3),tail=round(.82*length,3))


def canonical_rings(preset='vtol',geometry=None):
    penta=preset=='vtol5'
    body_length,width,height,shape=(1000,180,140,.5) if penta else (1200,170,110,.2)
    keys=np.asarray(PENTA_STATIONS if penta else STATIONS,float);keys[:,0]*=body_length
    keys[:,1]*=width;keys[:,2:]*=height
    if penta:
        keys=np.column_stack([keys,np.asarray([.22,.58,.83,.94,.88,.72,.55,.46])*height/2])
    def interpolate(x,col):
        xs=keys[:,0];ys=keys[:,col];ds=np.diff(ys)/np.diff(xs)
        if x<=xs[0]:return ys[0]
        if x>=xs[-1]:return ys[-1]
        def slope(i):
            if i==0:return ds[0]
            if i==len(xs)-1:return ds[-1]
            a,b=ds[i-1],ds[i]
            if a*b<=0:return 0
            ha,hb=xs[i]-xs[i-1],xs[i+1]-xs[i];wa,wb=2*hb+ha,hb+2*ha
            return (wa+wb)/(wa/a+wb/b)
        i=np.searchsorted(xs,x,side='left')-1;h=xs[i+1]-xs[i];u=(x-xs[i])/h
        return (2*u**3-3*u*u+1)*ys[i]+(u**3-2*u*u+u)*h*slope(i)+(-2*u**3+3*u*u)*ys[i+1]+(u**3-u*u)*h*slope(i+1)
    positions=sorted(set(keys[:,0])|set(np.linspace(0,body_length,128 if penta else 121)))
    rings=[];angles=np.arange(64)*math.pi*2/64
    for x in positions:
        w=interpolate(x,1)/2;h=interpolate(x,2)/2;cy=interpolate(x,3)
        exponent=2+shape*math.sin(math.pi*x/body_length)**2
        s=np.sin(angles);c=np.cos(angles)
        vertical=np.sign(s)*np.abs(s)**(2/exponent)
        upper=interpolate(x,4) if penta else h
        yy=cy+vertical*np.where(vertical>0,upper,h)
        shoulder=1
        if not penta:
            fade=np.clip((.56-x/body_length)/.15,0,1)
            shoulder=1-.29*fade**2*(3-2*fade)*np.maximum(0,s)**2
        rings.append(np.column_stack([np.full(64,x),yy,w*shoulder*np.sign(c)*np.abs(c)**(2/exponent)]))
    rings=np.asarray(rings)
    if penta and geometry:
        rings[:,:,0]*=geometry['fuselage_length']
        rings[:,:,1]*=geometry['fuselage_max_height']/.14
        rings[:,:,2]*=geometry['fuselage_max_width']/.18
        diameter=float(geometry.get('penta_motor_diameter',28))
        for ring in rings:
            t=ring[0,0]/(1000*geometry['fuselage_length']);u=np.clip((t-.80)/.20,0,1)
            blend=6*u**5-15*u**4+10*u**3
            yz=ring[:,1:];r=np.linalg.norm(yz,axis=1)
            target=yz/np.maximum(r[:,None],1e-12)*diameter/2
            ring[:,1:]=yz*(1-blend)+target*blend
    if not penta and geometry:
        rings*=tria_dimensions(float(geometry['wingspan']))['length']/1.2
    return rings

def standard_tria_nose(rings):
    """Continue the shared Tria shell forward into a new standard nose."""
    from backend.tria_gimbal import TRIA_GIMBAL_SEAM_FRACTION

    x=rings[:,0,0]
    seam=x[0]+TRIA_GIMBAL_SEAM_FRACTION*(x[-1]-x[0])
    joint=int(np.argmin(abs(x-seam)))
    rim=rings[joint,:,1:]
    center=(rim.min(axis=0)+rim.max(axis=0))/2
    slope=(rings[joint+1,:,1:]-rim)/(x[joint+1]-x[joint])
    first=x[0]+.12*(seam-x[0])
    length=seam-first
    u=np.linspace(0,1,48,endpoint=False)**2
    offsets=rim-center
    span=.045+.955*np.sqrt(u*(1.55-.55*u))
    rear_slope=.955*.225*offsets/length
    points=center+span[:,None,None]*offsets
    points+=length*(u*u*(u-1))[:,None,None]*(slope-rear_slope)
    shoulder=1.30*u*(1-u)**3+.70*u*u*(1-u)**2
    points[:,:,1]+=shoulder[:,None]*offsets[:,1]
    ahead=x[joint+2]-seam
    cabin_curve=2*(rings[joint+2,:,1:]-rim-ahead*slope)/ahead**2
    nose_curve=(-.955*.600625*offsets+4*length*(slope-rear_slope))/length**2
    nose_curve[:,1]+=1.40*offsets[:,1]/length**2
    correction=np.clip(cabin_curve-nose_curve,-.02,.02)
    distance=length*(1-u)
    fade=np.maximum(0,1-distance/42)**3
    points+=(distance**2*fade/2)[:,None,None]*correction
    nose=np.concatenate([np.broadcast_to((first+length*u)[:,None,None],(*points.shape[:2],1)),points],axis=2)
    result=np.concatenate([nose,rings[joint:]])
    stations=result[:,0,0]
    start=seam-.56*length
    end=seam+.67*length
    widths=np.max(np.abs(result[:,:,2]),axis=1)
    ends=np.interp([start,end],stations,widths)
    linear=ends[0]+(ends[1]-ends[0])*(stations-start)/(end-start)
    t=np.clip(np.minimum(stations-start,end-stations)/(.12*length),0,1)
    blend=t*t*(3-2*t)
    selected=blend>0
    result[selected,:,2]*=(1+blend[selected]*(linear[selected]/widths[selected]-1))[:,None]
    return result


def normalize(data):
    old=data['geometry'];g=dict(old)
    penta=old.get('fuse_preset')=='vtol5'
    o=data.get('options',{})
    clearance=(float(o.get('motorLength',30))+float(o.get('propOffset',8))+max(40,.15*float(o.get('propDiameter',152))))/1000
    if penta:
        from backend.penta_layout import penta_layout
        pod=penta_layout(float(old['wingspan']),float(old['root_chord']),
                         float(o.get('motorDiameter',old.get('penta_motor_diameter',28))),clearance,
                         wing_shape=None if old.get('manual_mode') else old.get('wing_shape'))
        wing_x=pod['wing'];tail_x=pod['tail']
    else:
        pod=tria_dimensions(float(old['wingspan']))
        wing_x=pod['wing'];tail_x=pod['tail']
    dx=wing_x-float(old['wing_x_pos']);dt=tail_x-float(old['tail_x_pos'])
    g.update(fuselage_length=pod['length'],fuselage_max_width=pod['width'],fuselage_max_height=pod['height'],
             wing_x_pos=wing_x,tail_x_pos=tail_x,wing_position='mid',fuse_type='conventional',
             fuse_width_scale=1,fuse_height_scale=1,vtol_fixed_body=True,tail_le_spacing=tail_x-wing_x)
    for key,delta in [('wing_ac_x',dx),('htail_ac_x',dt),('vtail_ac_x',dt)]:
        if key in g:g[key]+=delta
    if 'wing_ac_x' in g and 'htail_ac_x' in g:g['effective_tail_arm']=g['htail_ac_x']-g['wing_ac_x']
    if 'effective_tail_arm' in g:g['htail_arm']=g['effective_tail_arm']
    if 'vtail_ac_x' in g and 'wing_ac_x' in g:g['effective_vertical_tail_arm']=g['vtail_ac_x']-g['wing_ac_x']
    if penta and g.get('tail_booms'):
        b=dict(g['tail_booms']);b['x_start']+=dx;b['x_end']+=dt;b['length']+=dt-dx;g['tail_booms']=b
    if penta:g['penta_motor_diameter']=float(o.get('motorDiameter',old.get('penta_motor_diameter',28)))
    panels=[]
    for source in data['panels']:
        p={**source,'root':list(source['root']),'tip':list(source['tip'])}
        delta=dx if p['kind']=='wing' else dt
        p['root'][0]+=delta;p['tip'][0]+=delta;panels.append(p)
    rings=canonical_rings('vtol5' if penta else 'vtol',g)
    if not penta:
        from backend.tria_gimbal import follow_gimbal_profile
        rings=follow_gimbal_profile(rings)
        if o.get('cameraMount')!=3:
            rings=standard_tria_nose(rings)
    return {**data,'geometry':g,'panels':panels,'fuselage':rings.tolist()}
