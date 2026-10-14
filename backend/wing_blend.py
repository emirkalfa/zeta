"""Hollow, smooth center-wing transition in the real manufacturing mesh."""
import numpy as np
from backend.manufacturing import mesh_solid, profile


def blended_root(section, inset, chord, taper, length, end, wall, gap, height_gain=1.0,body_profile=None,frame=None,roof_blend=.75):
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
        # Mirrored dihedral roots otherwise meet along a single non-manifold
        # edge aft of the short body. A small central overlap makes a union
        # with material thickness rather than four faces touching one line.
        for z in np.r_[-.3,np.linspace(0,stop,33)]:
            u=max(0,min(1,z/end))
            blend=1-(6*u**5-15*u**4+10*u**3)
            scale=1+(taper-1)*z/length
            xy=polygon.copy()*scale
            # Blend the leading shoulder into the pod without lengthening
            # the trailing edge into the rear motor's carbon-tube bay.
            chord_fraction=np.clip(xy[:,0]/(chord*scale),0,1)
            xy[:,0]-=.20*chord*scale*blend*(1-chord_fraction)**2
            xy[:,1]*=1+(height_gain-1)*blend
            if use_body:
                wx=frame[0,0]*xy[:,0]+frame[0,2]*z+frame[0,3]
                lo=np.interp(wx,body_x,lower);hi=np.interp(wx,body_x,upper)
                target=(lo+hi)/2+side*thickness_weight*(hi-lo)/2
                local_y=(target-frame[1,0]*xy[:,0]-frame[1,2]*z-frame[1,3])/frame[1,1]
                # Stay inside the pod at the central seam rather than sharing
                # a tangent skin face with it; the pod supplies the outer cap.
                if penta:
                    # The exterior only expands from the real wing profile;
                    # an independent airfoil cavity stays strictly inside it.
                    local_y=np.where(side>0,np.maximum(local_y,xy[:,1]),np.minimum(local_y,xy[:,1]))
                body_blend=np.where(side>0,roof_blend,.75)*blend
                xy[:,1]=xy[:,1]*(1-body_blend)+local_y*body_blend
            rings.append(np.column_stack([xy,np.full(len(xy),z)]))
        rings=np.asarray(rings)
        return mesh_solid(rings,rings[0][:,:2])
    root=loft(section,end)
    if inset.area()>.01:
        root-=loft(inset,max(wall,end-wall*2),wall)
    return root


def motor_wing_transition(spec, leading, station, radius, center_y, back, wall=2):
    """Hollow C2 nacelle shoulder ending inside the actual local airfoil."""
    chord=(spec['chord']+(spec['tipChord']-spec['chord'])*station)*1000
    points=np.asarray(profile(spec['coords'],1).to_polygons()[0],dtype=float)
    # Intersect the polygon with the final chord station; this works for
    # asymmetric and symmetric profiles and either point winding.
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
