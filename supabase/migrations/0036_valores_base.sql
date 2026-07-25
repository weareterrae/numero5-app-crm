-- 0036_valores_base.sql
-- Valores-base PROVISÓRIOS do catálogo e parâmetros operacionais, alinhados com
-- o alvo de 65 €/hora e o mercado PT/Angola. Editáveis em Definições → Preços.
-- Guardas: só preenche o que ainda está [A DEFINIR] / vazio — não sobrescreve
-- edições posteriores do Sandro.

update precos_unitarios set preco=150, custo_interno=48, custo_externo=null, tempo_planeado_min=120, estado='ativo' where chave='direcao' and estado='a_definir';
update precos_unitarios set preco=60, custo_interno=18, custo_externo=null, tempo_planeado_min=50, estado='ativo' where chave='reunioes_extra' and estado='a_definir';
update precos_unitarios set preco=35, custo_interno=12, custo_externo=null, tempo_planeado_min=30, estado='ativo' where chave='revisoes_extra' and estado='a_definir';
update precos_unitarios set preco=50, custo_interno=0, custo_externo=null, tempo_planeado_min=0, estado='ativo' where chave='trabalho_urgente' and estado='a_definir';
update precos_unitarios set preco=150, custo_interno=40, custo_externo=null, tempo_planeado_min=120, estado='ativo' where chave='config_tracking' and estado='a_definir';
update precos_unitarios set preco=120, custo_interno=32, custo_externo=null, tempo_planeado_min=90, estado='ativo' where chave='config_campanhas' and estado='a_definir';
update precos_unitarios set preco=250, custo_interno=70, custo_externo=null, tempo_planeado_min=180, estado='ativo' where chave='integracao_crm' and estado='a_definir';
update precos_unitarios set preco=150, custo_interno=40, custo_externo=null, tempo_planeado_min=120, estado='ativo' where chave='automacoes' and estado='a_definir';
update precos_unitarios set preco=350, custo_interno=90, custo_externo=null, tempo_planeado_min=300, estado='ativo' where chave='chatbot_whatsapp' and estado='a_definir';
update precos_unitarios set preco=250, custo_interno=60, custo_externo=null, tempo_planeado_min=180, estado='ativo' where chave='landing_page' and estado='a_definir';
update precos_unitarios set preco=120, custo_interno=35, custo_externo=null, tempo_planeado_min=90, estado='ativo' where chave='animacao_avancada' and estado='a_definir';
update precos_unitarios set preco=120, custo_interno=35, custo_externo=null, tempo_planeado_min=90, estado='ativo' where chave='edicao_video_longo' and estado='a_definir';
update precos_unitarios set preco=150, custo_interno=40, custo_externo=null, tempo_planeado_min=120, estado='ativo' where chave='criar_newsletter' and estado='a_definir';
update precos_unitarios set preco=35, custo_interno=10, custo_externo=null, tempo_planeado_min=30, estado='ativo' where chave='criativos_anuncios' and estado='a_definir';
update precos_unitarios set preco=45, custo_interno=null, custo_externo=20, tempo_planeado_min=20, estado='ativo' where chave='locucao' and estado='a_definir';
update precos_unitarios set preco=4, custo_interno=1.5, custo_externo=null, tempo_planeado_min=5, estado='ativo' where chave='carregamento_produtos' and estado='a_definir';
update precos_unitarios set preco=280, custo_interno=70, custo_externo=null, tempo_planeado_min=240, estado='ativo' where chave='foto_presencial' and estado='a_definir';
update precos_unitarios set preco=350, custo_interno=90, custo_externo=null, tempo_planeado_min=300, estado='ativo' where chave='video_presencial' and estado='a_definir';
update precos_unitarios set preco=30, custo_interno=null, custo_externo=15, tempo_planeado_min=0, estado='ativo' where chave='deslocacoes' and estado='a_definir';
update precos_unitarios set preco=20, custo_interno=null, custo_externo=12, tempo_planeado_min=0, estado='ativo' where chave='dominio' and estado='a_definir';
update precos_unitarios set preco=15, custo_interno=null, custo_externo=8, tempo_planeado_min=0, estado='ativo' where chave='alojamento' and estado='a_definir';
update precos_unitarios set preco=25, custo_interno=null, custo_externo=20, tempo_planeado_min=0, estado='ativo' where chave='licencas_apis' and estado='a_definir';
update precos_unitarios set preco=120, custo_interno=32, custo_externo=null, tempo_planeado_min=90, estado='ativo' where chave='email_marketing' and estado='a_definir';
update precos_unitarios set preco=60, custo_interno=16, custo_externo=null, tempo_planeado_min=45, estado='ativo' where chave='envio_newsletter' and estado='a_definir';
update precos_unitarios set preco=60, custo_interno=16, custo_externo=null, tempo_planeado_min=45, estado='ativo' where chave='manutencao_site' and estado='a_definir';
update precos_unitarios set preco=15, custo_interno=5, custo_externo=null, tempo_planeado_min=15, estado='ativo' where chave='traducao' and estado='a_definir';

update configuracoes set valor='1' where chave='reunioes_incluidas' and valor is null;
update configuracoes set valor='45' where chave='duracao_reuniao_min' and valor is null;
update configuracoes set valor='60' where chave='preco_reuniao_extra' and valor is null;
update configuracoes set valor='50' where chave='suplemento_presencial' and valor is null;
update configuracoes set valor='2' where chave='revisoes_incluidas' and valor is null;
update configuracoes set valor='120' where chave='horas_mes_total' and valor is null;
update configuracoes set valor='35' where chave='pct_nao_faturavel' and valor is null;
