import json,difflib,sys,re
a=json.load(open('antes.json')); d=json.load(open('depois.json'))
def norm(s): return s.replace('ch_raw_','')
pairs=[]
raw=['app_question_commentary(text,text)','practice_correction_view(text,text)','tutor_truth(text,text)','app_question_timeline(text)','app_podcast(uuid)','lesson_view(lessons)','guideline_update_view(guideline_updates,boolean)',
 'app_tutor_session(uuid)','app_podcasts(text)','app_announcement()','app_admin_podcast_approve(uuid,text)','app_admin_podcast_publish(uuid,boolean)','app_admin_review_guideline_update(uuid,text,text)','app_admin_publish_guideline_update(uuid,boolean)']
for k in raw:
    n=k.split('(')[0]; r='ch_raw_'+k
    pairs.append((k, a[k]['def'], d[r]['def']))
for k in ['lesson_materials_json(uuid)','app_lesson_material(uuid)','app_ch_set_source_authority(uuid,text)','ch_worker_claims_by_ids(uuid[])','app_lessons(text,text)','app_lesson(uuid)','app_start_lesson_questions(uuid,integer)','app_guideline_updates(text,integer,text)','app_guideline_update(text)','app_start_guideline_questions(text,integer)','podcast_admin_view(uuid)']:
    pairs.append((k,a[k]['def'],d[k]['def']))
sel=sys.argv[1:] 
for k,x,y in pairs:
    if sel and k.split('(')[0] not in sel: continue
    y=y.replace('ch_raw_','')
    dl=list(difflib.unified_diff(x.splitlines(),y.splitlines(),'prod','novo',lineterm='',n=0))
    print('=====',k,'IDENTICO' if not dl else f'{len(dl)} linhas de diff')
    if dl and sel: print('\n'.join(dl))
