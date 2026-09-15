# Controles de cumplimiento para España

Plegat se diseña para soportar el registro diario de jornada exigido por el artículo 34.9 del Estatuto de los Trabajadores y su desarrollo reglamentario. La aplicación no sustituye el asesoramiento laboral ni la validación del convenio aplicable.

## Controles implementados o exigidos por diseño

- Cada fichaje se guarda como evento append-only con hora del dispositivo/servidor, recepción, secuencia e identificador de idempotencia.
- Las correcciones se modelan como nuevos eventos relacionados; nunca se sobrescribe el registro original.
- El tenant conserva una zona horaria IANA explícita y los datos se almacenan en UTC.
- El acceso se separa por tenant y por rol; las operaciones de plataforma y soporte se auditan.
- Los informes deben poder exportarse en formato legible y entregarse a la persona trabajadora, su representación legal o la Inspección cuando proceda.
- La política de producción debe conservar los registros durante un mínimo de cuatro años, con retención legal configurable y bloqueo de borrado durante investigaciones.

## RGPD y LOPDGDD

Antes de producción hay que documentar responsable/encargado, acuerdos de tratamiento, finalidades, categorías de datos, plazos, derechos, subencargados, transferencias internacionales y respuesta a brechas. Solo se almacenan los datos necesarios para identidad, organización, jornada y auditoría. Las solicitudes de supresión deben respetar la conservación laboral obligatoria; cuando proceda, se anonimiza en lugar de borrar el evento.

## Evidencias operativas

Se deben probar periódicamente restauraciones de backup, exportaciones de auditoría, rotación de secretos, sincronización horaria y segregación de acceso entre tenants. Las cuentas de soporte requieren motivo, alcance temporal y registro de cada consulta.
