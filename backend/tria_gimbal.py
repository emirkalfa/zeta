"""Fit the supplied gimbal shell directly to the removable nose joint."""
from functools import lru_cache
from pathlib import Path
import re

import manifold3d as md
import numpy as np

from .manufacturing import ManufacturingError, Part, connected_solids

RIM_Z = 14.44967
GIMBAL_COVER = 'body_gimbal_vtx_cover'
TRIA_GIMBAL_SEAM_FRACTION = .112


@lru_cache(maxsize=2)
def read_stl(name):
    data=(Path(__file__).resolve().parents[1]/'static'/'models'/'gimbal'/name).read_bytes()
    count=int.from_bytes(data[80:84],'little')
    if len(data)==84+50*count:
        dtype=np.dtype([('normal','<f4',3),('vertices','<f4',(3,3)),('attr','<u2')])
        points=np.frombuffer(data,offset=84,dtype=dtype)['vertices'].reshape(-1,3)
    else:
        points=np.asarray(re.findall(rb'vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)',data),
                          dtype=np.float32)
    vertices,indices=np.unique(points,axis=0,return_inverse=True)
    solid=md.Manifold(md.Mesh(vertices,indices.reshape(-1,3).astype(np.uint32)))
    if solid.status()!=md.Error.NoError or solid.is_empty():
        raise ManufacturingError('Gimbal STL dosyası kapalı bir hacim oluşturmuyor.')
    return solid


def profile_at(section,angles):
    polygon=max(section.to_polygons(),key=len)
    center=(polygon.min(axis=0)+polygon.max(axis=0))/2
    points=polygon-center
    phase=np.arctan2(points[:,1],points[:,0])
    radii=np.interp(angles,phase,np.linalg.norm(points,axis=1),period=2*np.pi)
    return center,radii


def follow_gimbal_profile(rings, *, blend_end=None, scale=(1.,1.,1.)):
    """Continue the gimbal rim position and tangent into the forward cabin."""
    source=read_stl('UPGRADED_GIMBAL_NOSE.stl').scale(scale)
    x=rings[:,0,0]
    seam=x[0]+TRIA_GIMBAL_SEAM_FRACTION*(x[-1]-x[0])
    end=seam+205 if blend_end is None else min(seam+205,blend_end)
    before=max(x[0],seam-40*scale[2])
    positions=np.unique(np.r_[x,np.linspace(before,end,43),seam])
    flat=rings[:,:,1:].reshape(len(x),-1)
    yz=np.column_stack([np.interp(positions,x,values) for values in flat.T]).reshape(len(positions),-1,2)
    centers=(yz.min(axis=1)+yz.max(axis=1))/2
    joint=np.searchsorted(positions,seam)
    angle=np.arange(yz.shape[1])*2*np.pi/yz.shape[1]
    directions=np.column_stack([np.sin(angle),np.cos(angle)])
    source_angles=np.arctan2(directions[:,0],-directions[:,1])
    rim_z=(RIM_Z-.04)*scale[2]
    sample_depth=4*scale[2]
    center,radius=profile_at(source.slice(rim_z),source_angles)
    previous,previous_radius=profile_at(source.slice(rim_z-sample_depth),source_angles)
    rim=directions*radius[:,None]+centers[joint]
    slopes=(radius-previous_radius)/sample_depth
    radial_slope=np.median(np.stack([np.roll(slopes,k) for k in range(-2,3)]),axis=0)
    slope=directions*radial_slope[:,None]+(center-previous)[[1,0]]*[1,-1]/sample_depth
    end_index=np.searchsorted(positions,end)
    panel=yz[end_index].copy()
    back=np.column_stack([np.interp([end-5,end+5],x,values) for values in flat.T])
    back_slope=((back[1]-back[0])/10).reshape(panel.shape)
    length=end-seam
    for index in np.flatnonzero((positions>before)&(positions<end)):
        offset=positions[index]-seam
        if offset<0:
            t=-offset/(seam-before)
            blend=1-t*t*(3-2*t)
            yz[index]=blend*(rim+offset*slope)+(1-blend)*yz[index]
        else:
            t=offset/length
            yz[index]=rim+(panel-rim)*t*t*(3-2*t)+length*t*(1-t)*((1-t)*slope-t*back_slope)
    return np.concatenate([np.broadcast_to(positions[:,None,None],(*yz.shape[:2],1)),yz],axis=2)


def install_gimbal_nose(body,outer,module,gap,nose_cuts):
    source=read_stl('UPGRADED_GIMBAL_NOSE.stl')
    cover=read_stl('GIMBAL_VTX_COVER.stl')
    face=module['seam_x_mm']-gap/2
    sections=outer.transform([[0,1,0,0],[0,0,1,0],[1,0,0,0]])
    target=sections.slice(face).transform([[0,-1,0],[1,0,0]])
    angles=np.linspace(-np.pi,np.pi,256,endpoint=False)
    center,rim=profile_at(source.slice(RIM_Z-.04),angles)
    target_center,target_rim=profile_at(target,angles)
    cover_end=cover.bounding_box()[5]

    def fit_rim(vertices):
        fitted=vertices.copy()
        offsets=fitted[:,:2]-center
        theta=np.arctan2(offsets[:,1],offsets[:,0])
        scale=np.interp(theta,angles,target_rim/rim,period=2*np.pi)
        t=np.clip((fitted[:,2]-cover_end)/(RIM_Z-cover_end),0,1)
        fitted[:,:2]+=offsets*((scale-1)*t*t*(3-2*t))[:,None]
        return fitted

    shift=target_center-center
    placement=[[0,0,1,face-RIM_Z],[0,1,0,shift[1]],[-1,0,0,-shift[0]]]
    nose=source.warp_batch(fit_rim).transform(placement)
    cover=cover.transform(placement)
    for cut in nose_cuts:
        nose-=cut
    pieces=sorted(connected_solids(nose),key=lambda p:p.volume(),reverse=True)
    if (len(pieces)>1 and all(p.bounding_box()[0]>=face-2 and p.bounding_box()[3]<=face+.001 for p in pieces[1:])
            and sum(p.volume() for p in pieces[1:])<.004*pieces[0].volume()):
        nose=pieces[0]
    if len(connected_solids(nose))!=1:
        raise ManufacturingError('Gimbal bağlantı kesimi burunda kopuk parça bırakıyor.')
    if (nose^body).volume()>.02:
        raise ManufacturingError('Gimbal burnu gövde bağlantısıyla çakışıyor.')
    if (cover^nose).volume()>.02 or (cover^body).volume()>.02:
        raise ManufacturingError('Gimbal VTX kapağı burunla çakışıyor.')
    return nose,[Part(GIMBAL_COVER,cover)],{
        'part':'body_nose','cover_part':GIMBAL_COVER,'mount_plane_mm':float(face),
    }
