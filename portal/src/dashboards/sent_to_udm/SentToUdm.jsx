import DashboardRenderer from "../../components/DashboardRenderer.jsx";
import definition from "./definition.json";

export default function SentToUdm() {
  return <DashboardRenderer definition={definition} />;
}
