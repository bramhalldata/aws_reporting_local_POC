import DashboardRenderer from "../../components/DashboardRenderer.jsx";
import definition from "./definition.json";

export default function PipelineHealth() {
  return <DashboardRenderer definition={definition} />;
}
