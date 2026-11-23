"""Hollow, smooth center-wing transition in the real manufacturing mesh."""
import numpy as np
from backend.manufacturing import mesh_solid, profile


def skin_height(rings, stations, ys, zs, side):
    """Interpolate the outside of the actual shell at wing-root vertices."""
    body_x=rings[:,0,0]
    output=ys.copy()
    for j,(x,z) in enumerate(zip(stations,zs)):
        index=int(np.clip(np.searchsorted(body_x,x),1,len(body_x)-1))
        a,b=rings[index-1:index+1,:,1:]
        t=np.clip((x-body_x[index-1])/(body_x[index]-body_x[index-1]),0,1)
        yz=a+(b-a)*t
        lateral=yz[:,1]
        if not lateral.min()<z<lateral.max():
            continue
        next_yz=np.roll(yz,-1,axis=0)
        mask=(np.minimum(lateral,next_yz[:,1])<=z)&(z<np.maximum(lateral,next_yz[:,1]))
        left,right=yz[mask],next_yz[mask]
        heights=left[:,0]+(z-left[:,1])*(right[:,0]-left[:,0])/(right[:,1]-left[:,1])
        output[j]=max(heights) if side[j]>0 else min(heights)
    return output


def blended_root(section, inset, chord, taper, length, end, wall, gap, height_gain=1.0,body_profile=None,frame=None,roof_blend=.75,seat_end=None,return_outer=False,roof_profile=None):
    if roof_profile is not None:
        roof_x=roof_profile[:,0,0]
        roof_limit=np.abs(roof_profile[:,:,2]).max(axis=1)*.54

    def loft(cross_section, stop, inset_mm=0):
        penta=body_profile is not None and roof_blend<.75
        use_body=body_profile is not None and not (penta and inset_mm)
        polygon=np.asarray(cross_section.to_polygons()[0])
        rings=[]
        if use_body:
            body=np.asarray(body_profile);body_x=body[:,0,0]
            lower=body[:,:,1].min(axis=1)+inset_mm
            upper=body[:,:,1].max(axis=1)-inset_mm
            aa=polygon;bb=np.roll(polygon,-1,axis=0)
            mids=[];halves=[]
            for x in polygon[:,0]:
                mask=(np.minimum(aa[:,0],bb[:,0])<=x+1e-8)&(np.maximum(aa[:,0],bb[:,0])>=x-1e-8)&(abs(bb[:,0]-aa[:,0])>1e-9)
                heights=aa[mask,1]+(bb[mask,1]-aa[mask,1])*(x-aa[mask,0])/(bb[mask,0]-aa[mask,0])
                lo,hi=(min(heights),max(heights)) if len(heights) else (polygon[:,1].min(),polygon[:,1].max())
                mids.append((lo+hi)/2);halves.append(max(0,(hi-lo)/2))
            mids=np.asarray(mids);halves=np.asarray(halves)
            side=np.where(polygon[:,1]>=mids,1.,-1.)
            thickness_weight=np.clip(halves/max(halves.max(),.001),0,1)
            if penta:
                shoulder_weight = thickness_weight**1.6
        start = max(0, end - 30) if height_gain != 1 else 0
        samples=65 if body_profile is not None and not penta and not inset_mm else 33
        for z in np.r_[-.3,np.linspace(0,stop,samples)]:
            u=max(0,min(1,(z-start)/(end-start)))
            blend=1-(6*u**5-15*u**4+10*u**3)
            scale=1+(taper-1)*z/length
            xy=polygon.copy()*scale
            xy[:,1]*=1+(height_gain-1)*blend
            if use_body:
                wx=frame[0,0]*xy[:,0]+frame[0,2]*z+frame[0,3]
                lo=np.interp(wx,body_x,lower);hi=np.interp(wx,body_x,upper)
                target=(lo+hi)/2+side*thickness_weight*(hi-lo)/2
                local_y=(target-frame[1,0]*xy[:,0]-frame[1,2]*z-frame[1,3])/frame[1,1]
                if penta:
                    outward = np.maximum(0, side*(local_y-xy[:,1]))
                    local_y = xy[:,1] + side*shoulder_weight*outward**2/(outward+5)
                body_blend=np.where(side>0,roof_blend,.55 if penta else .75)*blend
                xy[:,1]=xy[:,1]*(1-body_blend)+local_y*body_blend
                if not penta and not inset_mm and blend>0:
                    wy=frame[1,0]*xy[:,0]+frame[1,1]*xy[:,1]+frame[1,2]*z+frame[1,3]
                    wz=frame[2,0]*xy[:,0]+frame[2,1]*xy[:,1]+frame[2,2]*z+frame[2,3]
                    skin=skin_height(body,wx,wy+side*100,wz,side)
                    delta=side*(skin-wy)
                    fade=min(1,(1-u)/.30)
                    reach=12*thickness_weight*fade*fade*(3-2*fade)
                    rounded=np.where(np.abs(delta)<reach,
                        (reach+delta)**2/(4*np.maximum(reach,1e-9)),0)
                    xy[:,1]+=side*rounded/frame[1,1]
            if roof_profile is not None and z<end:
                wx=frame[0,0]*xy[:,0]+frame[0,2]*z+frame[0,3]
                wy=frame[1,0]*xy[:,0]+frame[1,1]*xy[:,1]+frame[1,2]*z+frame[1,3]
                limit=np.interp(wx,roof_x,roof_limit)
                rise=np.clip((z-end*.42)/(end*.58),0,1)
                relief=1-rise**3*(10-15*rise+6*rise**2)
                lateral=frame[2,0]*xy[:,0]+frame[2,1]*xy[:,1]+frame[2,2]*z+frame[2,3]
                skin=skin_height(roof_profile,wx,wy+100,np.clip(lateral,-limit,limit),np.ones_like(wy))
                excess=np.maximum(wy-(skin-inset_mm-3),0)
                lowered=excess+2*np.expm1(-excess/2)
                xy[:,1]-=relief*lowered/frame[1,1]
            rings.append(np.column_stack([xy,np.full(len(xy),z)]))
        rings=np.asarray(rings)
        return mesh_solid(rings,rings[0][:,:2])
    stop=end if seat_end is None else seat_end
    outer=loft(section,stop)
    root=outer
    if inset.area()>.01:
        root-=loft(inset,max(wall,stop-wall*2),wall)
    return (root,outer) if return_outer else root


def motor_wing_transition(spec, leading, station, radius, center_y, back, wall=2):
    """Hollow C2 nacelle shoulder ending inside the actual local airfoil."""
    chord=(spec['chord']+(spec['tipChord']-spec['chord'])*station)*1000
    points=np.asarray(profile(spec['coords'],1).to_polygons()[0],dtype=float)
    samples=[]
    for a,b in zip(points,np.roll(points,-1,axis=0)):
        if min(a[0],b[0])<=.64<=max(a[0],b[0]) and abs(b[0]-a[0])>1e-10:
            samples.append(a[1]+(b[1]-a[1])*(.64-a[0])/(b[0]-a[0]))
    low,high=min(samples)*chord,max(samples)*chord
    cy=float(leading[1])+(low+high)/2
    hy=max(.5,(high-low)*.2)
    start=back-8;end=float(leading[0])+chord*.64
    angles=np.linspace(0,2*np.pi,64,endpoint=False)
    def loft(inset,stop):
        rings=[]
        for x in np.linspace(start,stop,33):
            u=np.clip((x-start)/(end-start),0,1);blend=6*u**5-15*u**4+10*u**3
            ry=radius*(1-blend)+hy*blend-inset
            rz=radius*(1-blend)+radius*1.4*blend-inset
            rings.append(np.column_stack([np.full(64,x),
                center_y*(1-blend)+cy*blend+max(.25,ry)*np.sin(angles),
                float(leading[2])+rz*np.cos(angles)]))
        rings=np.asarray(rings)
        return mesh_solid(rings,rings[0][:,[1,2]])
    return loft(0,end)-loft(wall,end-wall*2)
