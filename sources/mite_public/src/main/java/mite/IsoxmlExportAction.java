package mite;

import com.google.common.base.Throwables;
import lsfusion.interop.action.MessageClientAction;
import lsfusion.server.data.sql.exception.SQLHandledException;
import lsfusion.server.data.value.DataObject;
import lsfusion.server.language.ScriptingErrorLog;
import lsfusion.server.language.ScriptingLogicsModule;
import lsfusion.server.logics.action.controller.context.ExecutionContext;
import lsfusion.server.logics.classes.ValueClass;
import lsfusion.server.logics.property.classes.ClassPropertyInterface;
import lsfusion.server.physics.dev.integration.internal.to.InternalAction;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * ТЗ п.4.2.5.1.6: генерация файла-предписания для бортового компьютера
 * техники в формате ISOXML (ISO 11783-10). Упрощённый профиль для стенда:
 * TASKDATA.XML с задачей, зонами обработки (TreatmentZone) и сеткой (Grid);
 * упаковывается в ZIP (стандартный способ передачи TaskData).
 *
 * Разбор zonesJson регэкспами (без JSON-парсера в classpath логики).
 */
public class IsoxmlExportAction extends InternalAction {

    private final ClassPropertyInterface prescriptionInterface;

    public IsoxmlExportAction(ScriptingLogicsModule LM, ValueClass... classes) {
        super(LM, classes);
        prescriptionInterface = getOrderInterfaces().get(0);
    }

    @Override
    protected void executeInternal(ExecutionContext<ClassPropertyInterface> ctx) throws SQLException, SQLHandledException {
        DataObject pf = ctx.getDataKeyValue(prescriptionInterface);
        try {
            String zonesJson = String.valueOf(findProperty("zonesJson[PrescriptionFile]").read(ctx, pf));
            String field = extract(zonesJson, "\"field\":\"([^\"]*)\"");
            if (field == null) field = "FIELD";
            // регэксп группы выше уже разворачивают \" — чистим возможный мусор
            field = xmlEscape(field);

            StringBuilder xml = new StringBuilder(4096);
            xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
            // квадратные скобки/уголки — можно: спецсимволы локализации только фигурные, а мы в Java
            xml.append("<ISO11783_TaskData VersionMajor=\"4\" VersionMinor=\"0\" "
                + "DataTransferOrigin=\"1\" TaskControllerReserved=\"0\">\n");
            xml.append("  <TSK A=\"TSK1\" B=\"PRESCRIPTION-").append(System.currentTimeMillis()).append("\">\n");
            xml.append("    <A>Предписание N — ").append(field).append("</A>\n");

            // зоны обработки: TreatmentZone (PDV=доза кг/га)
            Pattern zp = Pattern.compile("\\{\"zone\":(\\d+),\"meanN\":([0-9.]+),\"share\":([0-9.]+),\"doseKgDW\":([0-9.]+)");
            Matcher zm = zp.matcher(zonesJson);
            int zoneIdx = 0;
            StringBuilder grid = new StringBuilder();
            while (zm.find()) {
                zoneIdx++;
                double share = Double.parseDouble(zm.group(3));
                double dose = Double.parseDouble(zm.group(4));
                long percent = Math.round(share * 100);
                xml.append("    <TRT A=\"TRT").append(zoneIdx).append("\">")
                    .append("<D>Зона ").append(zoneIdx)
                    .append(" (N~").append(zm.group(2)).append(")</D></TRT>\n");
                xml.append("    <PDV A=\"PDV").append(zoneIdx).append("\" B=\"TRT").append(zoneIdx)
                    .append("\" D=\"1\"><C>").append(dose).append("</C></PDV>\n");
                grid.append("      <PLN A=\"P").append(zoneIdx).append("\" B=\"TRT").append(zoneIdx)
                    .append("\" C=\"").append(percent).append("\"/>\n");
            }
            if (zoneIdx == 0) {
                ctx.requestUserInteraction(new MessageClientAction(
                    "Зоны не заполнены — сначала выполните «Сформировать предписание» (k-means).", "ISOXML"));
                return;
            }
            // сетка-план: доли зон в процентах площади
            xml.append("    <TSKGRD>\n").append(grid).append("    </TSKGRD>\n");
            xml.append("  </TSK>\n</ISO11783_TaskData>\n");

            byte[] zip = zip("TASKDATA.XML", xml.toString().getBytes(StandardCharsets.UTF_8));
            findProperty("prescIsoxml[PrescriptionFile]").change(new lsfusion.base.file.RawFileData(zip), ctx, pf);
            findProperty("prescFormat[PrescriptionFile]").change("ISOXML", ctx, pf);
        } catch (Throwable e) {
            // раньше ловился только SemanticErrorException: NumberFormatException
            // от битого zonesJson уходил пользователю без сообщения
            ctx.requestUserInteraction(new MessageClientAction(
                "Ошибка генерации ISOXML: " + e.getMessage(), "Ошибка ISOXML"));
            throw Throwables.propagate(e);
        }
    }

    private static String extract(String s, String regex) {
        Matcher m = Pattern.compile(regex).matcher(s);
        return m.find() ? m.group(1) : null;
    }

    /** & < > в имени поля давали невалидный TASKDATA.XML (бортовой компьютер отвергнет файл). */
    private static String xmlEscape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&apos;");
    }

    private static byte[] zip(String name, byte[] content) {
        try (ByteArrayOutputStream bos = new ByteArrayOutputStream();
             ZipOutputStream zos = new ZipOutputStream(bos)) {
            zos.putNextEntry(new ZipEntry(name));
            zos.write(content);
            zos.closeEntry();
            return bos.toByteArray();
        } catch (Exception e) {
            throw Throwables.propagate(e);
        }
    }
}
