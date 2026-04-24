delete from messages
where channel = 'whatsapp'
  and external_chat_id = 'status@broadcast';

delete from contact_identities
where channel = 'whatsapp'
  and wa_jid = 'status@broadcast';

delete from conversations c
where c.channel = 'whatsapp'
  and not exists (
    select 1
    from messages m
    where m.conversation_id = c.id
  );

delete from contact_summary cs
where not exists (
  select 1
  from contacts ct
  where ct.id = cs.contact_id
);

delete from contacts ct
where not exists (
    select 1
    from contact_identities ci
    where ci.contact_id = ct.id
  )
  and not exists (
    select 1
    from messages m
    where m.contact_id = ct.id
  )
  and not exists (
    select 1
    from conversations c
    where c.contact_id = ct.id
  )
  and not exists (
    select 1
    from leads l
    where l.contact_id = ct.id
  )
  and not exists (
    select 1
    from sales_orders so
    where so.contact_id = ct.id
  )
  and not exists (
    select 1
    from contact_owners co
    where co.contact_id = ct.id
  );
