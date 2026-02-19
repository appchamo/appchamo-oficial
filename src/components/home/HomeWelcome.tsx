interface HomeWelcomeProps {
  userName: string;
  section?: { title?: string; subtitle?: string };
}

const HomeWelcome = ({ userName, section }: HomeWelcomeProps) => {
  const title = (section?.title || "Bem-vindo, {nome} 👋").replace("{nome}", userName);
  const subtitle = section?.subtitle || "Encontre o profissional ideal perto de você";

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground" dangerouslySetInnerHTML={{
        __html: title.replace(userName, `<span class="text-gradient">${userName}</span>`)
      }} />
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
};

export default HomeWelcome;
