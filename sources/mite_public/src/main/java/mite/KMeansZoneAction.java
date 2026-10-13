package mite;

import com.google.common.base.Throwables;
import lsfusion.interop.action.MessageClientAction;
import lsfusion.server.data.sql.exception.SQLHandledException;
import lsfusion.server.data.value.DataObject;
import lsfusion.server.language.ScriptingLogicsModule;
import lsfusion.server.logics.action.controller.context.ExecutionContext;
import lsfusion.server.logics.classes.ValueClass;
import lsfusion.server.logics.property.classes.ClassPropertyInterface;
import lsfusion.server.physics.dev.integration.internal.to.InternalAction;

import java.sql.SQLException;
import java.util.Arrays;

/**
 * ТЗ п.4.2.5.1.6 + «Требования к математическому обеспечению» (k-means):
 * зонирование поля для дифференцированного внесения кластеризацией k-means.
 *
 * Сетка значений на стенде — детерминированная симуляция пространственной
 * вариабельности агрохимии (реальных карт NDVI/электропроводности нет);
 * при появлении растровых данных достаточно заменить generateGrid().
 *
 * Параметры — примитивы (паттерн LagrangeAction: getKeyObject), объект
 * один — PrescriptionFile для записи результата. Дозы: баланс N с
 * коэффициентом «беднее зона — выше доза» (1.2/1.0/0.8).
 */
public class KMeansZoneAction extends InternalAction {

    private final ClassPropertyInterface prescriptionInterface;
    private final ClassPropertyInterface nBaseInterface;
    private final ClassPropertyInterface doseInterface;
    private final ClassPropertyInterface lonInterface;
    private final ClassPropertyInterface latInterface;
    private final ClassPropertyInterface fieldNameInterface;
    private final ClassPropertyInterface kInterface;

    public KMeansZoneAction(ScriptingLogicsModule LM, ValueClass... classes) {
        super(LM, classes);
        prescriptionInterface = getOrderInterfaces().get(0);
        nBaseInterface = getOrderInterfaces().get(1);
        doseInterface = getOrderInterfaces().get(2);
        lonInterface = getOrderInterfaces().get(3);
        latInterface = getOrderInterfaces().get(4);
        fieldNameInterface = getOrderInterfaces().get(5);
        kInterface = getOrderInterfaces().get(6);
    }

    @Override
    protected void executeInternal(ExecutionContext<ClassPropertyInterface> ctx) throws SQLException, SQLHandledException {
        DataObject pf = ctx.getDataKeyValue(prescriptionInterface);
        double nBase = asDouble(ctx.getKeyObject(nBaseInterface), 25.0);
        double dose = asDouble(ctx.getKeyObject(doseInterface), 90.0);
        double lon = asDouble(ctx.getKeyObject(lonInterface), 38.976);
        double lat = asDouble(ctx.getKeyObject(latInterface), 45.040);
        Object fieldRaw = ctx.getKeyObject(fieldNameInterface);
        String fieldName = fieldRaw == null ? "" : String.valueOf(fieldRaw);

        try {
            // КФ-К5: k=1 — равномерное внесение (одна зона, коэффициент 1.0,
            // требование этапа 1 при отсутствии данных агрохимии)
            int k = (int) asDouble(ctx.getKeyObject(kInterface), 3.0);
            if (k != 1) k = 3;
            boolean uniform = k == 1;
            int cols = 8, rows = 5;
            double[] vals = generateGrid(nBase, cols, rows);
            double dLon = 0.012 / (cols - 1), dLat = 0.008 / (rows - 1);
            KMeans km = new KMeans(vals, k, 30);

            Integer[] order = km.sortedByMean();
            double[] factors = uniform ? new double[]{1.0} : new double[]{1.2, 1.0, 0.8};
            StringBuilder json = new StringBuilder(2048);
            StringBuilder summary = new StringBuilder(512);
            json.append("{\"source\":\"").append(uniform ? "uniform" : "k-means")
                .append("\",\"field\":\"").append(jsonEscape(fieldName))
                .append("\",\"k\":").append(k).append(",\"zones\":[");
            summary.append(uniform ? "равномерное (k=1): " : "k-means (k=3): ");
            for (int zi = 0; zi < k; zi++) {
                int ci = order[zi];
                double share = (double) km.counts[ci] / vals.length;
                double doseZ = round2(dose * factors[zi]);
                double[] bbox = bboxOfCluster(km, ci, cols, rows, lon, lat, dLon, dLat);
                if (zi > 0) { json.append(','); summary.append("; "); }
                json.append("{\"zone\":").append(zi + 1)
                    .append(",\"meanN\":").append(round2(km.means[ci]))
                    .append(",\"share\":").append(round2(share))
                    .append(",\"doseKgDW\":").append(doseZ)
                    .append(",\"polygon\":[[").append(bbox[0]).append(',').append(bbox[1]).append("],[")
                    .append(bbox[2]).append(',').append(bbox[1]).append("],[")
                    .append(bbox[2]).append(',').append(bbox[3]).append("],[")
                    .append(bbox[0]).append(',').append(bbox[3]).append("]]}");
                summary.append("зона ").append(zi + 1)
                    .append(" — N~").append(round2(km.means[ci]))
                    .append(" мг/кг, доля ").append((int) Math.round(share * 100)).append('%')
                    .append(", доза ").append(doseZ).append(" кг д.в./га");
            }
            json.append("]}");

            findProperty("zonesJson[PrescriptionFile]").change(json.toString(), ctx, pf);
            findProperty("zonesSummary[PrescriptionFile]").change(summary.toString(), ctx, pf);
            findProperty("zonesMethod[PrescriptionFile]").change(uniform ? "равномерное" : "k-means", ctx, pf);
            findProperty("prescFormat[PrescriptionFile]").change("JSON", ctx, pf);
        } catch (Throwable e) {
            ctx.requestUserInteraction(new MessageClientAction("k-means: " + e.getMessage(), "Ошибка"));
            throw Throwables.propagate(e);
        }
    }

    /** Детерминированная вариабельность: базовое N ± ~35% (синусные волны). */
    private double[] generateGrid(double base, int cols, int rows) {
        double[] v = new double[cols * rows];
        for (int i = 0; i < cols; i++)
            for (int j = 0; j < rows; j++)
                v[i * rows + j] = base * (1.0 + 0.30 * Math.sin(i * 1.7) + 0.18 * Math.cos(j * 2.3 + i * 0.4));
        return v;
    }

    private double[] bboxOfCluster(KMeans km, int cluster, int cols, int rows,
                                   double lon, double lat, double dLon, double dLat) {
        double minLon = Double.MAX_VALUE, maxLon = -Double.MAX_VALUE;
        double minLat = Double.MAX_VALUE, maxLat = -Double.MAX_VALUE;
        for (int idx = 0; idx < km.assign.length; idx++) {
            if (km.assign[idx] != cluster) continue;
            double pLon = lon - 0.006 + (idx / rows) * dLon;
            double pLat = lat - 0.004 + (idx % rows) * dLat;
            minLon = Math.min(minLon, pLon); maxLon = Math.max(maxLon, pLon);
            minLat = Math.min(minLat, pLat); maxLat = Math.max(maxLat, pLat);
        }
        if (minLon > maxLon) { minLon = lon - 0.006; maxLon = lon + 0.006; minLat = lat - 0.004; maxLat = lat + 0.004; }
        // {minLon, minLat, maxLon, maxLat}
        return new double[]{round6(minLon), round6(minLat), round6(maxLon), round6(maxLat)};
    }

    private static double asDouble(Object v, double def) {
        return v instanceof Number ? ((Number) v).doubleValue() : def;
    }

    /** Имя поля попадает в JSON: кавычка/бэкслеш ломали разбор зон (ISOXML, карта). */
    private static String jsonEscape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static double round6(double v) { return Math.round(v * 1e6) / 1e6; }

    /** Классический Ллойд: инициализация равномерными квантилями. */
    static class KMeans {
        final double[] means;
        final int[] assign;
        final int[] counts;

        KMeans(double[] data, int k, int iterations) {
            this.means = new double[k];
            this.assign = new int[data.length];
            this.counts = new int[k];
            double[] sorted = data.clone();
            Arrays.sort(sorted);
            for (int c = 0; c < k; c++)
                means[c] = sorted[(int) ((c + 0.5) / k * (sorted.length - 1))];
            for (int it = 0; it < iterations; it++) {
                boolean changed = false;
                Arrays.fill(counts, 0);
                for (int i = 0; i < data.length; i++) {
                    int best = 0;
                    double bestD = Double.MAX_VALUE;
                    for (int c = 0; c < k; c++) {
                        double d = Math.abs(data[i] - means[c]);
                        if (d < bestD) { bestD = d; best = c; }
                    }
                    if (assign[i] != best) { assign[i] = best; changed = true; }
                    counts[best]++;
                }
                double[] sums = new double[k];
                for (int i = 0; i < data.length; i++) sums[assign[i]] += data[i];
                for (int c = 0; c < k; c++) if (counts[c] > 0) means[c] = sums[c] / counts[c];
                if (!changed) break;
            }
        }

        Integer[] sortedByMean() {
            Integer[] idx = new Integer[means.length];
            for (int c = 0; c < means.length; c++) idx[c] = c;
            Arrays.sort(idx, (a, b) -> Double.compare(means[a], means[b]));
            return idx;
        }
    }
}
