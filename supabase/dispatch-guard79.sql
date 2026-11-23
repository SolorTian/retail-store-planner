-- Preserve the installed worker and its service-only authorization; change only empty dispatch.
do $guard$
declare original text; updated text;
begin
 original:=pg_get_functiondef('public.planner_daily_worker(text,date,uuid,uuid,jsonb)'::regprocedure);
 updated:=replace(original, 'if not found then raise exception ''No user-triggered batch''; end if;', 'if not found then if action=''dispatch'' then return jsonb_build_object(''dispatch'',false); end if; raise exception ''No user-triggered batch''; end if;');
 if updated=original and position('if action=''dispatch'' then return jsonb_build_object(''dispatch'',false)' in original)=0 then raise exception 'Installed worker differs; review before applying'; end if;
 if updated<>original then execute updated; end if;
end;$guard$;
