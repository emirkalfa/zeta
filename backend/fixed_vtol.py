"""Canonical Tria and Penta bodies. Saved/custom sections cannot alter them."""
import math
import numpy as np

STATIONS=[(0,.035,.05,0),(.06,.58,.62,0),(.18,.94,.95,.04),(.30,1,1,.04),
          (.43,.9,.85,.02),(.55,.48,.48,0),(.65,.2,.25,0),(.8,.17,.22,0),(1,.13,.18,0)]

PENTA_STATIONS=[(0,.20,.25,0),(.08,.52,.56,.02),(.22,.88,.92,.04),(.38,1,1,.03),
                (.56,.95,.88,0),(.72,.78,.72,0),(.87,.57,.59,0),(1,.45,.50,0)]


def canonical_rings(preset='vtol',geometry=None):
    penta=preset=='vtol5'
    body_length,width,height,shape=(1000,180,140,.5) if penta else (1200,170,110,.2)
    keys=np.asarray(PENTA_STATIONS if penta else STATIONS,float);keys[:,0]*=body_length
    keys[:,1]*=width;keys[:,2:]*=height
    if penta:
        # One monotone roof envelope, rather than compressing a rising cabin
        # halfway along the hatch (which produced a hump and a dip).
        keys=np.column_stack([keys,np.asarray([.25,.36,.44,.46,.44,.40,.35,.50])*height/2])
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
        def smooth(u):
            u=np.clip(u,0,1);return 6*u**5-15*u**4+10*u**3
        a,b,cx,d=(.14,.28,.56,.76) if penta else (.12,.28,.43,.60)
        t=x/body_length;roof=1-(.55 if penta else 0)*smooth((t-a)/(b-a))*(1-smooth((t-cx)/(d-cx)))
        yy=cy+h*np.sign(s)*np.abs(s)**(2/exponent)
        if penta:roof=interpolate(x,4)/h
        yy=np.where(yy>cy,cy+(yy-cy)*roof,yy)
        rings.append(np.column_stack([np.full(64,x),yy,w*np.sign(c)*np.abs(c)**(2/exponent)]))
    rings=np.asarray(rings)
    if penta and geometry:
        rings[:,:,0]*=geometry['fuselage_length']
        rings[:,:,1]*=geometry['fuselage_max_height']/.14
        rings[:,:,2]*=geometry['fuselage_max_width']/.18
        diameter=float(geometry.get('penta_motor_diameter',28))
        # The short pod ends in the true motor's circular mounting face.
        for ring in rings:
            t=ring[0,0]/(1000*geometry['fuselage_length']);u=np.clip((t-.80)/.20,0,1)
            blend=6*u**5-15*u**4+10*u**3
            yz=ring[:,1:];r=np.linalg.norm(yz,axis=1)
            target=yz/np.maximum(r[:,None],1e-12)*diameter/2
            ring[:,1:]=yz*(1-blend)+target*blend
    return rings

def normalize(data):
    old=data['geometry'];g=dict(old)
    penta=old.get('fuse_preset')=='vtol5'
    o=data.get('options',{})
    clearance=(float(o.get('motorLength',30))+float(o.get('propOffset',8))+max(40,.15*float(o.get('propDiameter',152))))/1000
    if penta:
        from backend.penta_layout import penta_layout
        pod=penta_layout(float(old['wingspan']),float(old['root_chord']),float(o.get('motorDiameter',old.get('penta_motor_diameter',28))),clearance)
        wing_x=pod['wing'];tail_x=pod['tail']
    else:wing_x=.36;tail_x=.984
    dx=wing_x-float(old['wing_x_pos']);dt=tail_x-float(old['tail_x_pos'])
    g.update(fuselage_length=pod['length'] if penta else 1.2,fuselage_max_width=pod['width'] if penta else .17,fuselage_max_height=pod['height'] if penta else .11,
             wing_x_pos=wing_x,tail_x_pos=tail_x,wing_position=old.get('wing_position','mid') if penta else 'mid',fuse_type='conventional',
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
    return {**data,'geometry':g,'panels':panels,'fuselage':canonical_rings('vtol5' if penta else 'vtol',g if penta else None).tolist()}
