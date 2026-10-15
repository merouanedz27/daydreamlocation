update public.categories
set position = position + 1
where position >= 4
    and not exists (
        select 1
        from public.categories
        where slug = 'jabador'
    );
insert into public.categories (slug, name_fr, name_ar, position)
values ('jabador', 'Jabador', 'جبادور', 4) on conflict (slug) do nothing;