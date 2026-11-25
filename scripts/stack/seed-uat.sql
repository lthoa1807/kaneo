-- Synthetic, prod-like dataset for UAT. Not production data: every name, email
-- and body here is generated. Volume and shapes are close enough that migrations
-- and list queries run against a populated database instead of an empty one.
--
-- Ids are md5-derived, so re-running is idempotent. Load through
-- scripts/stack/seed-uat.sh, which supplies the bcrypt hash of the demo password.
\set ON_ERROR_STOP on

create temp table s_users as
select g as i,
       md5('uat-user-' || g) as id,
       'uat' || g || '@example.test' as email,
       (array['Mai Anh', 'Bao Tran', 'Chi Le', 'Dung Pham'])[g] as name
from generate_series(1, 4) g;

insert into "user" (id, name, email, email_verified, created_at, updated_at)
select id, name, email, true, now() - ((5 - i) * 37 || ' days')::interval, now()
from s_users
on conflict (id) do nothing;

-- provider_id 'credential' is the password account better-auth checks.
insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
select md5('uat-acct-' || i), id, 'credential', id, :'pw', now(), now()
from s_users
on conflict (id) do nothing;

insert into workspace (id, name, slug, description, created_at)
values (md5('uat-ws'), 'UAT Workspace', 'uat-workspace',
        'Synthetic workspace for the UAT stack', now() - interval '200 days')
on conflict (id) do nothing;

insert into workspace_member (id, workspace_id, user_id, role, joined_at)
select md5('uat-wm-' || i), md5('uat-ws'), id,
       case when i = 1 then 'owner' else 'member' end,
       now() - interval '190 days'
from s_users
on conflict (id) do nothing;

insert into project (id, workspace_id, slug, name, description, position, last_task_number, created_at)
select md5('uat-proj-' || g), md5('uat-ws'), 'u' || g, 'UAT Project ' || g,
       'Synthetic project ' || g || ' for load testing', g - 1, 75,
       now() - ((60 + g) || ' days')::interval
from generate_series(1, 8) g
on conflict (id) do nothing;

insert into "column" (id, project_id, name, slug, position, is_final, created_at, updated_at)
select md5('uat-col-' || g || '-' || c), md5('uat-proj-' || g),
       (array['Backlog', 'To Do', 'In Progress', 'Done'])[c],
       (array['backlog', 'to-do', 'in-progress', 'done'])[c],
       c - 1, c = 4, now(), now()
from generate_series(1, 8) g, generate_series(1, 4) c
on conflict (id) do nothing;

insert into task (id, project_id, column_id, number, title, description, status,
                  priority, assignee_id, position, due_date, created_at, updated_at)
select md5('uat-task-' || g || '-' || n), md5('uat-proj-' || g),
       md5('uat-col-' || g || '-' || (1 + n % 4)), n,
       'Task ' || n || ' of project ' || g,
       case when n % 3 = 0 then 'Synthetic description for load testing.' end,
       (array['backlog', 'to-do', 'in-progress', 'done'])[1 + n % 4],
       (array['low', 'medium', 'high', 'urgent'])[1 + n % 4],
       (select id from s_users u where u.i = 1 + n % 4), n - 1,
       case when n % 4 = 0 then now() + ((n % 30) || ' days')::interval end,
       now() - ((n % 180) || ' days')::interval, now()
from generate_series(1, 8) g, generate_series(1, 75) n
on conflict (id) do nothing;

insert into label (id, name, color, workspace_id, created_at, updated_at)
select md5('uat-label-' || g), 'label-' || g,
       (array['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'])[1 + g % 5],
       md5('uat-ws'), now(), now()
from generate_series(1, 10) g
on conflict (id) do nothing;

insert into label (id, name, color, workspace_id, task_id, created_at, updated_at)
select md5('uat-tlabel-' || g || '-' || n), 'label-' || (1 + n % 10), '#3b82f6',
       md5('uat-ws'), md5('uat-task-' || g || '-' || n), now(), now()
from generate_series(1, 8) g, generate_series(1, 75) n
where n % 5 = 0
on conflict (id) do nothing;

-- Comments are activity rows with type 'comment'; the comment table is not read
-- by the app, so seeding it would fake data nobody sees.
insert into activity (id, task_id, type, user_id, content, created_at, updated_at)
select md5('uat-c-' || g || '-' || n || '-' || c), md5('uat-task-' || g || '-' || n),
       'comment', (select id from s_users where i = 1 + (n + c) % 4),
       'Synthetic comment ' || c || ' on task ' || n,
       now() - ((n % 90) || ' days')::interval, now()
from generate_series(1, 8) g, generate_series(1, 75) n, generate_series(1, 2) c
where n % 10 = 0
on conflict (id) do nothing;

insert into activity (id, task_id, type, user_id, created_at, updated_at)
select md5('uat-act-' || g || '-' || n), md5('uat-task-' || g || '-' || n), 'created',
       (select id from s_users where i = 1 + n % 4),
       now() - ((n % 180) || ' days')::interval, now()
from generate_series(1, 8) g, generate_series(1, 75) n
on conflict (id) do nothing;

insert into activity (id, task_id, type, user_id, event_data, created_at, updated_at)
select md5('uat-act-st-' || g || '-' || n), md5('uat-task-' || g || '-' || n),
       'status_changed', (select id from s_users where i = 1 + n % 4),
       jsonb_build_object('oldStatus', 'to-do', 'newStatus', 'in-progress'),
       now() - ((n % 60) || ' days')::interval, now()
from generate_series(1, 8) g, generate_series(1, 75) n
where n % 7 = 0
on conflict (id) do nothing;

select 'users' as what, count(*) from "user"
union all select 'workspaces', count(*) from workspace
union all select 'projects', count(*) from project
union all select 'columns', count(*) from "column"
union all select 'tasks', count(*) from task
union all select 'labels', count(*) from label
union all select 'comments (activity)', count(*) from activity where type = 'comment'
union all select 'activity', count(*) from activity;
