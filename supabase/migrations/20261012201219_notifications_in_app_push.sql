-- =============================================================================
-- Notifications persistantes de l'équipe et abonnements Web Push.
--
-- Les notifications sont créées par le serveur (client admin côté serveur) :
-- le navigateur ne peut ni fabriquer une alerte pour un autre membre, ni
-- modifier son contenu. La clé de déduplication rend les retries du cron
-- idempotents.
-- =============================================================================
create table public.notifications (
    id bigint generated always as identity primary key,
    recipient_id uuid not null references public.profiles (id) on delete cascade,
    order_id bigint references public.orders (id) on delete
    set null,
        kind text not null,
        title_key text not null,
        body_key text not null,
        payload jsonb not null default '{}'::jsonb,
        dedupe_key text not null,
        read_at timestamptz,
        created_at timestamptz not null default now(),
        constraint notifications_kind_valid check (
            kind in (
                'order_created',
                'order_updated',
                'order_cancelled',
                'order_restored',
                'tomorrow',
                'return_due',
                'return_late'
            )
        )
);
create unique index notifications_recipient_dedupe_idx on public.notifications (recipient_id, dedupe_key);
create index notifications_recipient_unread_idx on public.notifications (recipient_id, created_at desc)
where read_at is null;
create table public.push_subscriptions (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    locale text not null default 'fr',
    user_agent text,
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);
alter table public.push_subscriptions
add constraint push_subscriptions_locale_valid check (locale in ('fr', 'ar'));
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
create policy notifications_read_own on public.notifications for
select to authenticated using (
        recipient_id = (
            select auth.uid()
        )
        and (
            select private.is_staff()
        )
    );
create policy notifications_mark_own on public.notifications for
update to authenticated using (
        recipient_id = (
            select auth.uid()
        )
        and (
            select private.is_staff()
        )
    ) with check (
        recipient_id = (
            select auth.uid()
        )
        and (
            select private.is_staff()
        )
    );
create policy notifications_delete_own on public.notifications for delete to authenticated using (
    recipient_id = (
        select auth.uid()
    )
    and (
        select private.is_staff()
    )
);
create policy push_subscriptions_read_own on public.push_subscriptions for
select to authenticated using (
        user_id = (
            select auth.uid()
        )
        and (
            select private.is_staff()
        )
    );
create policy push_subscriptions_insert_own on public.push_subscriptions for
insert to authenticated with check (
        user_id = (
            select auth.uid()
        )
        and (
            select private.is_staff()
        )
    );
create policy push_subscriptions_update_own on public.push_subscriptions for
update to authenticated using (
        user_id = (
            select auth.uid()
        )
        and (
            select private.is_staff()
        )
    ) with check (
        user_id = (
            select auth.uid()
        )
        and (
            select private.is_staff()
        )
    );
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (
    user_id = (
        select auth.uid()
    )
    and (
        select private.is_staff()
    )
);
comment on table public.notifications is 'Notifications internes persistantes, créées par le serveur et lues par leur destinataire.';
comment on table public.push_subscriptions is 'Abonnements Web Push par utilisateur et par appareil.';