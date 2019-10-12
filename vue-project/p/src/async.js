const async = {
  functional: true,
  render(h, context) {
    return h(context.props.coms, {
      props: {
        coms: Function
      }
    });
  },
  props: {
    coms: Function
  }
}

export default async